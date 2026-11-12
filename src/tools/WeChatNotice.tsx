import {isWeChat} from './wechat-core';

export interface WeChatNoticeProps {
  isZip?: boolean;
  isImage?: boolean;
  customText?: string;
}

export function WeChatNotice({isZip = false, isImage = false, customText}: WeChatNoticeProps) {
  if (!isWeChat()) return null;

  return (
    <div className="wechat-notice" role="note" aria-label="微信环境提示">
      <div className="wechat-notice-title">
        <span>📱</span> 微信环境提示
      </div>
      <p style={{margin: 0}}>
        {customText
          ? customText
          : isZip
          ? '微信内置浏览器无法直接保存 ZIP 压缩包。如点击「打包下载」无反应，请点击右上角「···」选择「在浏览器打开」下载，或使用下方单页逐个下载。'
          : isImage
          ? '长按下方修复后的图片即可「保存到手机相册」；如需以指定文件名下载，可点击右上角「···」在浏览器中打开。'
          : '微信内置浏览器对本地文件下载有较多限制。如点击下载无反应，请点击右上角「···」选择「在浏览器打开」即可直接保存到手机。'}
      </p>
    </div>
  );
}
