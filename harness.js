const loadData = async () => {

  var results = []

  for (i of 'abcdefghijklmno') {
    response = await fetch('json/' + i + '.json')
    results = results.concat(await response.json())
  }

  return results
}

const setupDatabase = async () => {

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

// best-effort uniqueness, in real life you need to do an upsert-like-thing.
const encodeRowId = (date, thread_id) => {
  sort = 0xffffffff - Math.floor(date / 1000);

  // top bit: 0
  // next 32 bits: time reversed.
  // next 31 bits: thread_id.

  return "" + sort + " * " + Math.pow(2, 31) + " + " + (parseInt("0x" + thread_id.substr(8)) & 0x7fffffff)
}

const indexData = async (database, data) => {
  const insertData = (tx) => {
    let i = 0;
    for (let datum of data) {
      tx.executeSql("INSERT INTO search_test ('rowid' , 'thread_id', 'subject', 'body', 'from', 'to', 'cc', 'bcc', 'attachments', 'labels', 'meta', 'rfc822msgid', 'deliveredto', 'replyto') VALUES(" + encodeRowId(datum.date, datum.thread_id) + ",?,?,?,?,?,?,?,?,?,?,?,?,?);", 
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

const openIndexedDb = async () => {
  const version = 1;

  request = indexedDB.open("test", version);

  return new Promise((resolve, reject) => {
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      db.createObjectStore("documents")
      db.createObjectStore("index")
    }
    request.onerror = reject;
    request.onsuccess = (e) => {
      resolve(request.result)
    }
  })

}

const addToIndexedDb = async (idb, data) => {

  tx = idb.transaction(["documents", "index"], "readwrite")

  for (let datum of data) {
    let rowid = encodeRowId(datum.date, datum.thread_id)
    tx.objectStore("documents").put(rowid, datum)
  }

  return new Promise((resolve, reject) => {
    tx.onerror = reject;
    tx.onsuccess = resolve;
  })

}

const testSQLSearchFactory = (database) => {
  return (query) => {
    const start = performance.now();
    var xactOpen, queryDone, xactDone, results;
    return new Promise((resolve, reject) => {
      database.transaction((tx) => {
        xactOpen = performance.now();
        tx.executeSql(query, [], (tx, r) => {
          console.log('r', r)
          results = r;
          queryDone = performance.now();
        })
      }, reject, () => {
        xactDone = performance.now()
        console.log('search took ' + (xactDone - start), {open: xactOpen - start, query: queryDone - xactOpen})
        console.table(results.rows)
      });
    })
  }
}


console.log('running')
const go = async () => {
  const database = await setupDatabase();
  window.testSQLSearch = testSQLSearchFactory(database);
  const data = await loadData()
//  await indexData(database, data);
//

  const idb = await openIndexedDb()
//  await addToIndexedDb(idb, data)

  console.log('done!')
}

go()
