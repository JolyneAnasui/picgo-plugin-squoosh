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
  const userConfig = ctx.getConfig('picgo-plugin-squoosh');
  if (!userConfig) throw new Error('picgo-plugin-squoosh config not found');
  const settings = ctx.getConfig('settings');
  if (settings.rename || settings.autoRename) throw new Error('rename method conflict');
  
  let imagePool = new ImagePool();
  let output = ctx.output;
  try {
    for (let i in output) {
      if (userConfig[output[i].extname]) {
        let t0 = new Date();
        let b = output[i].buffer;
        let ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        let image = imagePool.ingestImage(ab);
        let originSize = Math.round(b.byteLength / 1024);
        ctx.log.info(`Compressing ${output[i].fileName} ${originSize} kb`);
        
        await image.encode(DefaultEncodeOptions[output[i].extname]);
        let encoded = await Object.values(image.encodedWith)[0];
        output[i].buffer = Buffer.from(encoded.binary);
        
        let newSize = Math.round(encoded.size / 1024);
        let ratio = Math.round(newSize / originSize * 100);
        let t = new Date().getTime() - t0.getTime();
        ctx.log.success(`${output[i].fileName} ${newSize} kb ${ratio}% ${t}ms`);
      }
      if (userConfig['md5-rename']) {
        let hash = crypto.createHash('md5');
        hash.update(output[i].buffer);
        let originName = output[i].fileName;
        output[i].fileName = hash.digest('hex') + output[i].extname;
        ctx.log.info(`${originName} -> ${output[i].fileName}`);
      }
    }
  } catch(err) {
    ctx.log.error(err);
  }
  imagePool.close();
  
  ctx.log.info('**** squoosh end here ****')
  return ctx
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
