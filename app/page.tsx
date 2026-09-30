import { SiteHeader } from '@/app/components/SiteHeader';
import { Hamster } from '@/app/components/Hamster';
import { penFont } from '@/app/fonts';
import { PRODUCTS } from '@/lib/products';

const STEPS = [
  { scene: 'ready', title: '글을 붙여 넣습니다', text: '한 번에 20만 자까지 넣을 수 있습니다.' },
  { scene: 'working', title: '교정햄이 문단마다 고칩니다', text: '긴 글은 문단을 나눠 여러 문단을 함께 고칩니다.' },
  {
    scene: 'done',
    title: '고친 곳을 골라 가져갑니다',
    text: '마음에 들지 않는 수정은 하나씩 되돌리고, 교정본이나 대조본을 복사합니다.',
  },
] as const;

const RULES = [
  { title: '산 날부터 1년', text: '씨앗은 산 날부터 1년 동안 쓸 수 있습니다.' },
  {
    title: '실패하면 돌려드립니다',
    text: '끝내 고치지 못한 문단이 있으면 그 글에 쓴 씨앗을 모두 돌려드립니다.',
  },
  {
    title: '7일 안에는 전액 환불',
    text: '쓰지 않은 씨앗은 산 지 7일 안이면 전액, 그 뒤에는 10%(최소 1,000원)를 빼고 환불합니다.',
  },
];

// 첫 화면: 무엇을 해 주는지, 어떻게 맡기는지, 값은 얼마인지.
// 카드사 심사는 로그인 없이 보이는 곳에서 상품·가격·이용 기간·환불 기준을 확인하므로 여기에 모두 둔다.
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className={`landing ${penFont.variable}`}>
        <section className="lp-hero">
          <div className="lp-inner lp-hero-inner">
            <div>
              <p className="lp-kicker">▸ 해바라기씨 받고 일하는 교정 햄스터</p>
              <h1 className="lp-title">
                고친 곳마다,
                <br />
                이유까지.
              </h1>
              <p className="lp-lead">
                맞춤법만 보지 않습니다. 군더더기, 번역투, 어색한 어순, 너무 긴 문장까지 문단마다
                고치고 왜 고쳤는지 옆에 적어 드립니다.
              </p>
              <div className="lp-cta-row">
                <a className="primary lp-cta" href="/write">
                  글 맡기기 →
                </a>
                <span className="lp-cta-note">
                  씨앗 1개로 3,000자 · <b>990원</b>부터
                </span>
              </div>
            </div>

            {/* 원고지 예시: 빨간 펜으로 고친 모습. 손글씨 문구를 바꾸면 app/fonts.ts의 글꼴 파일도 다시 만든다 */}
            <div className="lp-stage">
              <div className="lp-sheet">
                <p className="lp-sheet-label">원문 · 1문단</p>
                <p className="lp-sheet-text">
                  이 보고서는 여러{' '}
                  <span className="lp-fix">
                    <del>문제점들에 대한</del>
                    <ins>문제점을</ins>
                  </span>
                  <br />
                  <span className="lp-fix">
                    <del>분석이 이루어졌다</del>
                    <ins>분석했다</ins>
                  </span>
                  .
                </p>
                <ul className="lp-notes">
                  <li>
                    <span className="lp-chip">적·들·의·것</span>
                    <span className="lp-note">‘-들’, ‘-에 대한’은 뜻을 흐려서 뺐어요</span>
                  </li>
                  <li>
                    <span className="lp-chip">주술 호응</span>
                    <span className="lp-note">‘보고서는’에 맞게 명사형을 풀었어요</span>
                  </li>
                </ul>
              </div>
              <Hamster scene="ready" scale={5} line="이 교정햄에게 맡겨줘! 뭐든지 다 해줄게." />
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-inner">
            <p className="lp-kicker">▸ 교정햄의 하루</p>
            <h2 className="lp-h2">맡기는 방법</h2>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li key={s.scene} className="lp-step">
                  <div className="lp-step-stage">
                    <span className="lp-step-num">0{i + 1}</span>
                    <Hamster scene={s.scene} scale={4} />
                  </div>
                  <div className="lp-step-body">
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-price" id="price">
          <div className="lp-inner">
            <div className="lp-price-head">
              <div>
                <p className="lp-kicker">▸ 요금</p>
                <h2 className="lp-h2">씨앗 주머니</h2>
                <p className="lp-price-lead">
                  씨앗 1개로 띄어쓰기 포함 <b>3,000자</b>까지 교정합니다. 3,000자를 넘으면
                  3,000자마다 씨앗이 1개씩 더 듭니다.
                </p>
              </div>
              <Hamster
                className="hamster-rev"
                scene="seed"
                line="교정햄이 씨앗 먹고 힘낼 수 있게 도와주세요!"
              />
            </div>
            <ul className="lp-products">
              {PRODUCTS.map((p) => (
                <li key={p.id} className="lp-product">
                  <span className="lp-product-name">{p.name}</span>
                  <span className="lp-product-body">
                    <span className="lp-product-seeds">
                      씨앗 <b>{p.seeds}개</b>
                    </span>
                    <span className="lp-product-price">{p.price.toLocaleString('ko-KR')}원</span>
                    <span className="lp-product-unit">
                      개당 {Math.round(p.price / p.seeds).toLocaleString('ko-KR')}원
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <ul className="lp-rules">
              {RULES.map((r) => (
                <li key={r.title}>
                  <strong>{r.title}</strong>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-inner lp-trust">
            <div>
              <p className="lp-kicker">▸ 글 보관</p>
              <h2 className="lp-h2">맡긴 글은</h2>
            </div>
            <div className="lp-trust-body">
              <p>교정은 생성형 AI가 합니다.</p>
              <p>
                글 전체는 서버에 저장하지 않습니다. 새로 고쳐도 결과를 다시 볼 수 있게{' '}
                <b>고친 부분(고치기 전·후 구절과 이유)만 24시간</b> 보관하고 자동으로 지웁니다.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-end">
          <div className="lp-inner lp-end-inner">
            <div className="lp-end-hamster">
              <Hamster scene="done" scale={4} />
            </div>
            <div className="lp-end-text">
              <h2>씨앗 하나면 3,000자.</h2>
              <p>붙여 넣고 누르면, 나머지는 교정햄이 합니다.</p>
            </div>
            <a className="primary lp-cta" href="/write">
              글 맡기기 →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
