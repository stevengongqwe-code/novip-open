import Brand from '../Brand';
import {getPopularTools, NOT_FOUND_TITLE, NOT_FOUND_SUBTITLE, NOT_FOUND_ATTITUDE} from './not-found-core';
import {Feedback, StudyFooter} from '../tool-common';
import '../study.css';
import './tools.css';

export default function NotFound({
  navigate,
}: {
  navigate?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const popular = getPopularTools(6);

  return (
    <div className="study-app">
      <header className="study-header">
        <Brand />
        <span>免费 · 无登录 · 无水印</span>
      </header>
      <main className="tool-main not-found-main">
        <div className="not-found-banner">
          <span className="not-found-code" aria-hidden="true">404</span>
          <h1 className="not-found-title">{NOT_FOUND_TITLE}</h1>
          <p className="not-found-subtitle">{NOT_FOUND_SUBTITLE}</p>
          <div className="not-found-attitude-card" role="note">
            <span className="not-found-attitude-tag">💡 NOVIP 态度</span>
            <p className="not-found-attitude-text">{NOT_FOUND_ATTITUDE}</p>
          </div>
        </div>

        <section className="not-found-recommendations" aria-label="热门工具推荐">
          <h2 style={{fontSize: '17px', margin: '24px 0 14px', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <span>🔥 推荐这些高频反 VIP 工具</span>
          </h2>
          <div className="home-grid">
            {popular.map((t) => (
              <a
                key={t.id}
                href={t.path}
                onClick={navigate}
                className="home-card not-found-card"
              >
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px'}}>
                  <h3 style={{margin: 0, fontSize: '16px'}}>{t.name}</h3>
                  <span className="home-hero-badge-blue" style={{fontSize: '11px', padding: '1px 6px', borderRadius: '4px'}}>
                    免VIP
                  </span>
                </div>
                <p style={{fontSize: '13px', color: '#52525b', lineHeight: '1.5', margin: 0}}>
                  {t.pitch}
                </p>
                <div style={{marginTop: '10px', textAlign: 'right', fontSize: '12px', color: '#2563eb', fontWeight: 600}}>
                  立即使用 ➔
                </div>
              </a>
            ))}
          </div>
        </section>

        <div style={{margin: '28px 0', textAlign: 'center'}}>
          <a
            href="/"
            onClick={navigate}
            className="study-btn"
            style={{
              display: 'inline-block',
              textDecoration: 'none',
              padding: '10px 24px',
              fontSize: '15px',
              borderRadius: '8px',
            }}
          >
            返回 NOVIP 工具首页 ➔
          </a>
        </div>

        <Feedback tool="404" />
      </main>
      <StudyFooter />
    </div>
  );
}
