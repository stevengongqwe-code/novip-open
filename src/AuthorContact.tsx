import {useRef, useState} from 'react';
import {copyLocal} from './tool-common';

const qrImage = '/author-wechat-qr.png';

export default function AuthorContact() {
  const [message, setMessage] = useState('');
  const [qrRequested, setQrRequested] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  return <aside className="author-contact" aria-label="作者联系方式">
    <div>
      <span className="author-contact__eyebrow">CONTACT / 联系作者</span>
      <h2>有问题，或者有个好主意？</h2>
      <p>功能建议、使用反馈，都可以通过微信联系作者。</p>
      <button type="button" className="author-contact__qr" aria-label="放大微信二维码" onClick={() => {setQrRequested(true); dialog.current?.showModal();}}>
        <img src={qrImage} alt="作者 Steven 的微信二维码" width="820" height="1214" loading="lazy"/>
        <span>扫码联系作者 · 点击放大</span>
      </button>
    </div>
    <div className="author-contact__action">
      <label htmlFor="author-wechat">作者微信<input id="author-wechat" value="StevenGRK" readOnly onFocus={e => e.currentTarget.select()} aria-label="作者微信号"/></label>
      <button type="button" onClick={async () => {
        try {await copyLocal('StevenGRK'); setMessage('已复制微信号：StevenGRK');}
        catch {setMessage('自动复制不可用，请长按或选中微信号复制。');}
      }}>复制微信号</button>
      <p role="status" aria-live="polite">{message}</p>
    </div>
    <dialog ref={dialog} className="author-contact__dialog" aria-labelledby="wechat-qr-title" onClick={e => {if (e.target === e.currentTarget) dialog.current?.close();}}>
      <div className="author-contact__dialog-head"><h2 id="wechat-qr-title">微信联系作者</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="关闭微信二维码">关闭</button></div>
      {qrRequested && <img src={qrImage} alt="作者 Steven 的微信二维码原图" width="820" height="1214" decoding="async"/>}
      <p>微信号：StevenGRK · 可长按图片保存</p>
      <a href={qrImage} download="NOVIP-作者微信二维码.png">保存二维码原图</a>
    </dialog>
  </aside>;
}
