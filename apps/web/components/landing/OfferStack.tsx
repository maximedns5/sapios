import { Check, Verified } from "@/components/site/Icons";

/**
 * Illustration du héros : une pile de cartes d'offres, celle du dessus tamponnée « Match ».
 * Purement décorative (données fictives), lue par le texte du héros ; mouvement en CSS seul.
 */
export default function OfferStack() {
  return (
    <div className="lp-stack" aria-hidden="true">
      <div className="lp-stack-in">
        <span className="lp-back lp-back--left">
          <span />
        </span>
        <span className="lp-back lp-back--right">
          <span />
        </span>
        <div className="lp-offer">
          <div className="lp-offer-photo">
            <svg viewBox="0 0 360 220" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" focusable="false">
              <rect width="360" height="220" fill="#E4DDD3" />
              <rect x="24" y="22" width="120" height="96" rx="4" fill="#F3EFE8" />
              <rect x="82" y="22" width="4" height="96" fill="#DCD3C7" />
              <rect x="24" y="68" width="120" height="4" fill="#DCD3C7" />
              <rect x="170" y="22" width="120" height="96" rx="4" fill="#F3EFE8" />
              <rect x="228" y="22" width="4" height="96" fill="#DCD3C7" />
              <rect x="170" y="68" width="120" height="4" fill="#DCD3C7" />
              <rect x="0" y="150" width="360" height="70" fill="#CFC5B8" />
              <rect x="40" y="132" width="200" height="10" rx="3" fill="#B9AC9C" />
              <rect x="52" y="142" width="8" height="50" fill="#A99B8A" />
              <rect x="220" y="142" width="8" height="50" fill="#A99B8A" />
              <rect x="80" y="96" width="56" height="36" rx="3" fill="#5F5A55" />
              <rect x="104" y="128" width="8" height="6" fill="#5F5A55" />
              <rect x="150" y="104" width="44" height="28" rx="3" fill="#7A746E" />
              <circle cx="300" cy="118" r="26" fill="#9DB3A0" />
              <circle cx="318" cy="102" r="18" fill="#8AA48E" />
              <rect x="288" y="140" width="26" height="30" rx="4" fill="#B98F6E" />
            </svg>
            <span className="lp-offer-dots">
              <span className="is-on" />
              <span />
              <span />
            </span>
          </div>
          <div className="lp-offer-body">
            <strong className="lp-offer-title">Data analyst junior</strong>
            <span className="lp-offer-co">
              Maison Verte
              <Verified size={15} />
            </span>
            <span className="lp-offer-pay">
              42–48 k€ <small>brut/an</small>
            </span>
            <span className="lp-offer-meta">Paris 11e · 2 j de télétravail · CDI</span>
            <span className="lp-offer-have">
              <span>
                <Check size={13} />
                Master vérifié
              </span>
              <span>
                <Check size={13} />
                Python
              </span>
              <span>
                <Check size={13} />
                SQL
              </span>
            </span>
          </div>
          <span className="lp-stamp">MATCH</span>
        </div>
      </div>
    </div>
  );
}
