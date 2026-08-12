// examples/02-ipc-messagechannel/utility.js
// 跑在 utility process 的 NodeJS 代码
process.parentPort.on('message', (event) => {
  const { data, ports } = event;
  if (data.kind === 'attach') {
    const port = ports[0];
    port.on('message', (msg) => {
      // 模拟长任务 (image conversion)
      const { id, buffer } = msg.data;
      // 模拟处理时间
      setTimeout(() => {
        const out = Buffer.from(buffer).reverse();
        port.postMessage({ id, done: true, out });
      }, 50);
    });
    port.start();
  }
});
