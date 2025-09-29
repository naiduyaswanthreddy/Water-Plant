import { Helmet } from 'react-helmet-async';

type SeoProps = {
  title?: string;
  description?: string;
  canonical?: string;
  noIndex?: boolean;
};

const defaultDescription =
  'Manage customers, bottles, orders, deliveries, pricing and transactions for the Sri Venkateswara Water Plant.';

const Seo = ({ title, description = defaultDescription, canonical, noIndex = false }: SeoProps) => {
  return (
    <Helmet>
      {title ? <title>{title} · Sri Venkateswara Water Plant</title> : <title>Sri Venkateswara Water Plant</title>}
      <meta name="description" content={description} />
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      {noIndex ? <meta name="robots" content="noindex,nofollow" /> : null}
    </Helmet>
  );
};

export default Seo;
