// examples/03-native-module/index.js
// 直接 require 测试
const path = require('node:path');
const sum = require('node-gyp-build');

const arr = [1, 2, 3, 4, 5];
console.log('sum:', sum.sum(arr));
