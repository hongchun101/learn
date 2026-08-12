// examples/11-utility-process-videoutil/util.js
// 视频缩略图，演示 Utility Process 用 ffmpeg / sharp 做重 CPU 工作
process.parentPort.on('message', (event) => {
  const { data, ports } = event;
  if (data.kind === 'attach') {
    const port = ports[0];
    port.on('message', async (msg) => {
      const { id, file } = msg.data;
      try {
        // 真实场景下用 ffmpeg / sharp
        const buf = Buffer.from('mocked-thumbnail');
        port.postMessage({ id, ok: true, thumb: buf });
      } catch (e) {
        port.postMessage({ id, ok: false, error: String(e) });
      }
    });
    port.start();
  }
});
