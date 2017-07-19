// loadData from disk.
//
// each file is a JSON array of 10,000 threads of the following format (note, in my original tests I
// just took the body of the last email on the thread and ran it rhrough a naive html->text converter
// where necessary, a better benchmark might be to include the
// body of every message on the thread. The array fields are all the header values from each email as returned
// by the gmail API.
//
//	{
//		"thread_id": "107af1cae2ef91d3",
//		"date": "1132514291000",
//		"subject": "Google Mail is different. Here is what you need to know.",
//		"from": ["Google Mail Team <gmail-noreply@google.com>" ],
//		"to": ["Conrad Irwin <conrad.irwin@googlemail.com>"],
//		"cc": [],
//		"bcc": [],
//		"deliveredto": [],
//		"replyto": [],
//		"listid": [],
//		"labels": ["INBOX"],
//		"attachments": [],
//		"body": " First of all, welcome. And thanks for opening a Google Mail account! We think Google Mail is different. So to help you get started, you may want to: Check out the new Google Mail Tour in our Getting Started section. It is good for, well, getting started. Visit our Help Center. Here you can browse frequently asked questions, search for answers and learn about some of Google Mail's cool features, like labels, keyboard shortcuts and free POP access. Import your contacts to Google Mail from Yahoo! Mail, Outlook, Hotmail and other programs. Then email your friends with your brand new Google Mail address. As you are using Google Mail, you might also see some ads or related links. We believe that you should not have to share your inbox with large, blinking, irrelevant ads. Google Mail's small text ads are matched by computers, and designed to be relevant to the messages you are viewing. Which means for once, you might even find ads to be interesting and useful. Users have often told us that the more they use Google Mail, the more they discover its added benefits--such as being able to find any message instantly or to manage all your contacts in one place. So go ahead and give it a try. In the meantime, we will keep working on making Google Mail the best email service around. Thanks for joining us for the ride. We hope you will enjoy Google's approach to email. Thanks, The Google Mail Team P.S. You can sign in to your account any time by visiting http://mail.google.com "
//	}
const loadData = async () => {
  let results = []

  for (i of 'abcdefghijklmno') {
    response = await fetch('data/json/' + i + '.json')
    results = results.concat(await response.json())
    console.log('loaded', i)
  }

  return results
}

// sorted by date, unique-ish by document ids for the database.
// For performant searches it's important that documents are sorted
// in the order that you want to retrieve them, which for us is
// by date descending.
const encodeRowIdForWebSQL = (date, thread_id) => {
  // top bit: 0
  // next 32 bits: time reversed.
  // next 31 bits: thread_id.
  let sort = 0xffffffff - Math.floor(date / 1000);
  return "" + sort + " * " + Math.pow(2, 31) + " + " + (parseInt("0x" + thread_id.substr(8)) & 0x7fffffff)
}

// encodeRowIdForIndexedDB. For fairness, I also truncated this to 64-bits, but we could
// actually use the full thread_id which would be nice for avoiding uniqueness checks.
const encodeRowIdForIndexedDB = (date, thread_id) => {
  let sort = 0xffffffff - Math.floor(date / 1000);
  let thrid = parseInt("0x" + thread_id.substr(8))

  str = String.fromCharCode((sort >> 16) & 0xffff) + String.fromCharCode((sort) & 0xffff) +
    String.fromCharCode((thrid >> 16) & 0xffff) + String.fromCharCode((thrid) & 0xffff)
  return str
}


const setupWebSQL = async () => {
  const targetVersion = 3;
  const migrateDatabase = (tx) => {
      tx.executeSql('DROP TABLE IF EXISTS search_test')
      tx.executeSql(`CREATE VIRTUAL TABLE search_test USING fts3(
            thread_id,
            subject,
            body,
            from,
            to,
            cc,
            bcc,
            attachments,
            labels,
            meta,
            rfc822msgid,
            deliveredto,
            replyto,
            tokenize=porter
            )`)
  }
  return new Promise((resolve, reject) => {
    const database = window.openDatabase('test', '', '', 1 * 1024 * 1024 * 1024);

    if (parseInt(database.version) != targetVersion) {
      database.changeVersion(database.version, targetVersion, migrateDatabase, reject, () => { resolve(database) })
    } else {
      resolve(database);
    }

  })
}


const setupIndexedDB = async () => {
  const version = 1;

  request = indexedDB.open("test", version);

  return new Promise((resolve, reject) => {
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      db.createObjectStore("documents").createIndex("search", "entries", {multiEntry: true})
    }
    request.onerror = reject;
    request.onsuccess = (e) => {
      resolve(request.result)
    }
  })
}


const addToWebSQL = async (database, data) => {
  const insertData = (tx) => {
    let i = 0;
    for (let datum of data) {
      tx.executeSql("INSERT INTO search_test ('rowid' , 'thread_id', 'subject', 'body', 'from', 'to', 'cc', 'bcc', 'attachments', 'labels', 'meta', 'rfc822msgid', 'deliveredto', 'replyto') VALUES(" + encodeRowIdForWebSQL(datum.date, datum.thread_id) + ",?,?,?,?,?,?,?,?,?,?,?,?,?);", 
        [datum.thread_id, datum.subject, datum.body, datum.from.join("|"), datum.to.join("|"), datum.cc.join("|"), datum.bcc.join("|"), "", datum.labels.join("|"), "", datum.rfc822msgid.join("|"), datum.deliveredto.join("|"), datum.replyto.join("|")]
        )
      if (i++ % 1000 == 0) {
        console.log(i, performance.now())
      }
    }

  }
  return new Promise((resolve, reject) => {
    database.transaction(insertData, reject, resolve);
  })
}


const testSQLSearch return (query) => {
	const start = performance.now();
	let xactOpen, queryDone, xactDone, results;
	return new Promise((resolve, reject) => {
		database.transaction((tx) => {
			xactOpen = performance.now();
			tx.executeSql("SELECT * from search_test WHERE search_test MATCH ? LIMIT 25", [query], (tx, r) => {
				results = r;
				queryDone = performance.now();
			})
		}, reject, () => {
			xactDone = performance.now()
			console.log('websql took ' + (xactDone - start), {open: xactOpen - start, query: queryDone - xactOpen})
			resolve(xactDone - start);
		});
	})
}

const testIndexedDBSearch = (query) => {	
    token = stemmer(query)

    const start = performance.now();
    let cursorDone = 0;
    let docsDone = 0;
    return new Promise((resolve, reject) => {
      let tx = idb.transaction(["documents"], "readonly")
      let results = [];
      let docs = [];
      let seen = {};
      tx.objectStore("documents").index("search")
        .openCursor(IDBKeyRange.bound(token + "\x00", token + "\x01", true, false))
				.onsuccess = (e) => {
					let cursor = event.target.result;

					if (cursor && !seen[cursor.primaryKey]) {
						seen[cursor.primaryKey] = true
						results.push(cursor.value.raw)
					}

					if (cursor && results.length < 25) {
							cursor.continue();
					} else {
						let xactDone = performance.now();
							console.log('indexeddb took', (xactDone - start)) //, {index: cursorDone - start, docs: docsDone - cursorDone})
							resolve(xactDone - start)
					}
      }
    })
  }
}

const fields = {
  body: 'a',
  from: 'b',
  subject: 'c',
  to: 'd',
  cc: 'e',
  bcc: 'f',
  replyto: 'g',
  deliveredto: 'h',
  rfc822msgid: 'i',
  labels: 'j'
}

const tokenize = (field) => {
  let tokens = [];
  if (!Array.isArray(field)) {
    field = [field];
  }
  for (let item of field) {
    if (item) {
      for (let token of item.toLowerCase().split(/[^a-zA-Z0-9]+/)) {
        if (token) {
          tokens.push(stemmer(token))
        }
      }
    }
  }

  return tokens;
}

// Encode search index entries relatively efficiently using the format:
// <term>\x00<rowid><field><position>
const searchIndexEntries = (datum, rowId) => {
  const output = []

  for (let field in fields) {
    let id = fields[field]
    let pos = 0;
    for (let token of tokenize(datum[field])) {
      output.push(token + "\x00" + rowId +  id + String.fromCharCode(pos++))
    }
  }

  return output;
}

const addToIndexedDB = async (idb, data) => {

  let tx = idb.transaction(["documents"], "readwrite")

  let total = 0;

  for (datum of data) {
    let rowId = encodeRowIdForIndexedDB(datum.date, datum.thread_id)
    tx.objectStore("documents").put({raw: datum, entries: searchIndexEntries(datum, rowId)}, rowId)

    if ((total++ % 1000) == 0) {
      let _tx = tx;
      await (new Promise((resolve, reject) => {
        _tx.oncomplete = (e) => {
          resolve()
        }
        _tx.onerror = (e) => {
          console.log('error', e)
        }
      }))
      console.log(total, performance.now(), datum.thread_id)
      tx =  idb.transaction(["documents"], "readwrite");
    }
  }
}

let database, idb;

const go = async () => {
	console.log('running')
  start = performance.now();
  database = await setupWebSQL();
  console.log('have websql')
  idb = await setupIndexedDB()
  console.log('have indexeddb')

  window.testSQLSearch = testSQLSearchFactory(database);
  window.testIndexedDB = testIndexedDBSearchFactory(idb);

  console.log('ready')
  const data = await loadData()
  console.log('loading data', start - performance.now())
  start = performance.now()
  await addToWebSQL(database, data);

  console.log('adding to webSQL', start - performance.now())
  start = performance.now()
   await addToIndexedDB(idb, data)
  console.log('adding to indexedDB', start - performance.now())

  let accum = []
  for (let i = 0; i < 1000; i++) {
    accum.push(await testSQLSearch("derfledermouse"));
  }
  console.log("Websql: min=", Math.min.call(Math, accum), "max=", Math.max.call(Math, accum), "avg=", Math.avg.call(Math, accum))
  accum = []
  for (let i = 0; i < 1000; i++) {
    await testIndexedDB("derfledermouse");
  }
  console.log("indexeddb min=", Math.min.call(Math, accum), "max=", Math.max.call(Math, accum), "avg=", Math.avg.call(Math, accum))
}

Math.avg = function () {
  return Array.from(arguments).reduce((s,x) => s + x) / arguments.length
}

go()
