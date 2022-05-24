const {ImagePool, encoders} = require('@squoosh/lib');
const crypto = require('crypto');

const pluginConfig = ctx => {
  let userConfig = ctx.getConfig('picgo-plugin-squoosh');
  if (!userConfig) {
      userConfig = {};
  }
  return [
    {name: 'md5-rename', type: 'confirm', alias: 'md5-rename'},
    {name: '.jpg', type: 'confirm', alias: 'jpg'},
    {name: '.png', type: 'confirm', alias: 'png'},
    {name: '.webp', type: 'confirm', alias: 'webp'},
    {name: '.avif', type: 'confirm', alias: 'avif'},
    {name: '.jxl', type: 'confirm', alias: 'jxl'},
    {name: '.wp2', type: 'confirm', alias: 'wp2'},
  ];
};

const DefaultEncodeOptions = Object.fromEntries(
	Object.entries(encoders).map(([key, encoder]) => {
		const extension = `.${encoder.extension}`;
		return [extension, Object.fromEntries([[key, {}]])];
	})
);
// DefaultEncodeOptions = {
//   '.jpg': { mozjpeg: {} },
//   '.webp': { webp: {} },
//   '.avif': { avif: {} },
//   '.jxl': { jxl: {} },
//   '.wp2': { wp2: {} },
//   '.png': { oxipng: {} }
// };
// reference: https://github.com/pekeq/gulp-libsquoosh/blob/main/index.js#L28
// default settings: https://github.com/GoogleChromeLabs/squoosh/blob/dev/libsquoosh/src/codecs.ts#L284

const handle = async (ctx) => {
  ctx.log.info('**** squoosh begin here ****')
  let t0 = new Date();

  const userConfig = ctx.getConfig('picgo-plugin-squoosh');
  if (!userConfig) throw new Error('picgo-plugin-squoosh config not found');
  const settings = ctx.getConfig('settings');
  if (userConfig['md5-rename'] && (settings.rename || settings.autoRename)) throw new Error('rename method conflict');
  
  let imagePool = new ImagePool();

  const jobs = ctx.output.map(async outputi => {
    try {
      if (userConfig[outputi.extname]) {
        let t = new Date();
        let b = outputi.buffer;
        let ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        let image = imagePool.ingestImage(ab);
        let originSize = Math.round(b.byteLength / 1024);
        ctx.log.info(`Compressing ${outputi.fileName} ${originSize} kb`);
        
        await image.encode(DefaultEncodeOptions[outputi.extname]);
        let encoded = await Object.values(image.encodedWith)[0];
        outputi.buffer = Buffer.from(encoded.binary);
        
        let newSize = Math.round(encoded.size / 1024);
        let ratio = Math.round(newSize / originSize * 100);
        ctx.log.success(`Finish ${outputi.fileName} ${newSize} kb ${ratio}% ${new Date().getTime() - t.getTime()} ms`);
      }// else throw new Error('extname debug error');
      if (userConfig['md5-rename']) {
        let hash = crypto.createHash('md5');
        hash.update(outputi.buffer);
        let originName = outputi.fileName;
        outputi.fileName = hash.digest('hex') + outputi.extname;
        ctx.log.info(`${originName} -> ${outputi.fileName}`);
      }
      return outputi;
    } catch (err) {
      ctx.emit('notification', {
        title: `${outputi.fileName} compression error`,
        body: err
      });
      ctx.log.error(`${outputi.fileName} compression error`);
      ctx.log.error(err);
    }
  });
  
  ctx.output = await Promise.all(jobs);
  ctx.output = ctx.output.filter(Boolean);
  imagePool.close();
  
  ctx.log.info(`**** squoosh end here ${new Date().getTime() - t0.getTime()} ms ****`)
  return ctx;
}

module.exports = (ctx) => {
  const register = () => {
    ctx.helper.beforeUploadPlugins.register('squoosh', {
      handle,
    })
  }
  return {
    register,
    config: pluginConfig,
  }
}
