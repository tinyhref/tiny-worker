# TinyWorker

> Simplifying the use of Web Workers — call worker functions like regular async functions

✅ Key Features:
- 🔁 Seamless two-way communication
- 🧠 Clean, developer-friendly API
- ⚡ Ideal for offloading heavy computations
- 🛠️ Supports passing arguments and receiving results like local function calls

##  Installation

```bash
npm install @tinyhref/tiny-worker
or
yarn add @tinyhref/tiny-worker
```

## Use It

```js
import { TinyWorker } from '@tinyhref/tiny-worker';

const worker = TinyWorker.init({
  methods: {
    counter: 0,
    inc() {
      return ++this.counter;
    },
    add(a: number, b: number) {
      return a + b;
    },
    multiply: function(a: number, b: number) {
      console.log('lodash', this._);

      return a * b;
    }
  },
  imports: ['https://unpkg.com/lodash@4.17.21/lodash.js']
});

const channelSharedWorker = TinyWorker.createWorker('channel', {
  isSharedWorker: true,
  workerType: 'module',
  methods: {
    multiply: async (a: number, b: number) => {
      console.log('lodash', lodash)

      return a * b;
    }
  },
  imports: {
    'lodash': 'https://esm.sh/lodash-es@4.17.21'
  }
});

(async () => {
  console.log('1 + 1 = ', await worker.add(1, 1));
  console.log('2 * 2 = ', await worker.multiply(2, 2));
})();
```
