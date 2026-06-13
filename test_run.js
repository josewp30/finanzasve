const fs = require('fs');
const content = fs.readFileSync('main.js', 'utf8');

global.window = {
  location: { reload: () => {} },
  onload: null,
  addEventListener: () => {},
  matchMedia: () => ({ matches: false })
};
global.document = {
  querySelectorAll: () => [],
  getElementById: (id) => ({
    style: {},
    dataset: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    addEventListener: () => {},
    getContext: () => ({
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, fill: () => {}, closePath: () => {}, fillRect: () => {}, arc: () => {}, fillText: () => {}
    }),
    appendChild: () => {},
    textContent: '',
    innerHTML: '',
    value: '',
    querySelector: () => null,
    querySelectorAll: () => []
  }),
  createElement: (tag) => {
    if (tag === 'canvas') {
      return {
        width: 0, height: 0,
        getContext: () => ({
          beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, fill: () => {}, closePath: () => {}, fillRect: () => {}, arc: () => {}, fillText: () => {}
        }),
        toDataURL: () => ''
      };
    }
    return {
      setAttribute: () => {},
      appendChild: () => {}
    };
  },
  addEventListener: () => {},
  head: { appendChild: () => {} }
};
global.navigator = { serviceWorker: { register: () => Promise.resolve() } };
global.supabase = {
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb) => {
        console.log("Mock: onAuthStateChange called!");
        cb('INITIAL_SESSION', null); // Trigger no user flow
      }
    }
  })
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  keys: () => []
};
global.Chart = class { constructor() {} };
global.setTimeout = (cb) => { cb(); return 1; };
global.clearTimeout = () => {};

try {
  eval(content);
  console.log("main.js executed successfully to the end.");
} catch(e) {
  console.error("Runtime error during main.js evaluation:", e);
}
