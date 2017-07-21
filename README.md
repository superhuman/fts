This is a very very minimal search engine (it only allows searching for single
terms) designed to test the feasibility of using IndexedDB as a full text
search engine.

See the discussion at https://groups.google.com/a/chromium.org/forum/#!topic/storage-dev/0njGY5N6wRs

### To test:

```
git clone git@github.com:superhuman/fts
cd fts
python -m SimpleHTTPServer 8090
open http://localhost:8090
```

see `harness.js` for the bencharmking code, and `stemmer.js` for a porter
stemmer I found on the internet.

### Still TODO:

Before this can be a reasonable test of a search engine we need to implement
the following searches over indexeddb.

* queries for multiple terms: "conrad lunch"
* queries for terms in a field: "from:conrad"
* queries in a date range: "from:conrad before:X"
* queries with OR: "from:(conrad OR rahul)"
* queries with quotes: 'from:"conrad Irwin"'

It would also be nice to implement WebSQL's SNIPPET function.

### Stretch goal

* can we literally port the whole of the Sqlite FTS3 module, maybe
  emscriptened, using IndexedDB as a page store?


### Probably out of scope
* not using a porter stemmer (all of them are pretty equivalent in terms of
  performance, and it's easier to compare results with websql if you use the
  same stemmer).
