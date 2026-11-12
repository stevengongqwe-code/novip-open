import './brand.css';

export default function Brand() {
  return (
    <a className="novip-brand" href="/" aria-label="NOVIP 工具首页">
      <img
        src="/novip-logo.svg"
        width="44"
        height="44"
        alt="NOVIP Logo"
        loading="eager"
        decoding="sync"
        onError={(e) => {
          const target = e.currentTarget;
          if (!target.src.endsWith('.jpg')) {
            target.src = '/novip-logo.jpg';
          }
        }}
      />
      <span className="novip-wordmark">
        NOVIP
        <small>大学生，别花冤枉钱。</small>
      </span>
    </a>
  );
}

