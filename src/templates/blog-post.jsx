import { Link, graphql, withPrefix } from "gatsby";
import * as React from "react";
import Layout from "../components/layout";
import Markdown from "react-markdown";
import { Card } from "../components/card";
import { createSlug } from "../utils/utils";
import "../style/article.css";
import "../style/cards.css";
import siteConfig from "../../siteConfig.json";

// Les partenariats sont définis dans siteConfig.json (overridé au build depuis
// le dépôt de contenu). Chaque clé correspond à un tag d'article ; `logo` est le
// nom du fichier dans resources/LogosPartenariats (copié dans static/ au build).
const PARTNERSHIPS = siteConfig.partnerships || {};

const BlogPost = ({ data, children }) => {
  const date = data.markdownRemark.fields.date;
  const { author, title, tags, abstract, sound } =
    data.markdownRemark.frontmatter;

  // Détecte les partenariats actifs selon les tags et résout le chemin du logo
  const activePartnerships = tags
    ? tags
        .filter((tag) => PARTNERSHIPS[tag])
        .map((tag) => ({
          ...PARTNERSHIPS[tag],
          logo: withPrefix(`/LogosPartenariats/${PARTNERSHIPS[tag].logo}`),
        }))
    : [];

  // Sélectionne les 4 articles ayant le plus de tags en commun avec l'article courant
  const currentSlug = data.markdownRemark.fields.slug;
  const currentTags = tags || [];
  const relatedPosts = data.allMarkdownRemark.nodes
    .filter(
      (node) =>
        node.fields.slug !== currentSlug &&
        node.fields.slug !== "" &&
        !node.fields.slug.startsWith("_")
    )
    .map((node) => ({
      node,
      sharedTags: (node.frontmatter.tags || []).filter((t) =>
        currentTags.includes(t)
      ).length,
    }))
    .filter(({ sharedTags }) => sharedTags > 0)
    .sort((a, b) => b.sharedTags - a.sharedTags)
    .slice(0, 4)
    .map(({ node }) => node);

  return (
    <Layout>
      <main>
        {data.markdownRemark.tableOfContents && (
          <div id="toc-container">
            <nav
              dangerouslySetInnerHTML={{
                __html: data.markdownRemark.tableOfContents,
              }}
            />
          </div>
        )}
        <header id="article-header">
          <div className="overlay">
            <h1 dangerouslySetInnerHTML={{ __html: title }} />
            {author && (
              <span id="article-meta">
                Publié par{" "}
                {author.map((authorName, index) => (
                  <span key={index}>
                    <a href={`/${createSlug(authorName)}`}>{authorName}</a>
                    {index < author.length - 1 && " & "}
                  </span>
                ))}
                {date && ` le ${date}`}
              </span>
            )}
            <button
              className="button print"
              onClick={() => {
                window.print();
              }}
            >
              &darr; Enregistrer au format pdf
            </button>
            {tags && (
              <div id="tags-container">
                {tags.map((el, i) => (
                  <a className="tag" key={i}>
                    {el}
                  </a>
                ))}
              </div>
            )}
          </div>
        </header>
        <div id="article-container">
          <article id="article">
            <div className="article-main">
              {abstract && (
                <aside>
                  <p>
                    <Markdown>{abstract}</Markdown>
                  </p>
                </aside>
              )}
              {sound && (
                <audio controls>
                  <source src={sound} type="audio/wav" />
                </audio>
              )}
              <section
                dangerouslySetInnerHTML={{ __html: data.markdownRemark.html }}
              />
            </div>
          </article>

          {activePartnerships.length > 0 && (
            <div className="partnership-footer">
              <span className="partnership-label">
                Article en partenariat avec :
              </span>
              <div className="partnership-logos">
                {activePartnerships.map((partner, i) => (
                  <a href={partner.url} target="_blank" rel="noopener noreferrer">
                    <img
                      key={i}
                      src={partner.logo}
                      alt={`Logo ${partner.name}`}
                      className="partnership-logo"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {relatedPosts.length > 0 && (
            <section className="related-articles">
              <h2>Genre en cours vous recommande aussi:</h2>
              <div id="cards-container">
                {relatedPosts.map((post) => (
                  <Card
                    key={post.fields.slug}
                    postData={post}
                    toggleTag={() => {}}
                    selectedTags={[]}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </Layout>
  );
};

export const query = graphql`
  query BlogPostBySlug($slug: String!) {
    site {
      siteMetadata {
        title
        siteUrl
      }
    }
    markdownRemark(fields: { slug: { eq: $slug } }) {
      id
      excerpt(pruneLength: 200)
      html
      frontmatter {
        author
        title
        tags
        abstract
        sound
        uuid
        prettyName
      }
      fields {
        date(formatString: "DD MMMM, YYYY", locale: "fr")
        slug
        collection
        image {
          publicURL
          childImageSharp {
            resize(width: 1200, height: 630, fit: COVER) {
              src
            }
          }
        }
      }
      tableOfContents
    }
    allMarkdownRemark(limit: 999) {
      nodes {
        excerpt(pruneLength: 600)
        frontmatter {
          title
          tags
          author
          abstract
          uuid
          prettyName
        }
        fields {
          collection
          prettyName
          date(formatString: "DD MMMM, YYYY", locale: "fr")
          slug
          image {
            childImageSharp {
              gatsbyImageData(placeholder: TRACED_SVG, width: 400)
            }
          }
        }
      }
    }
  }
`;

// Supprime le HTML éventuel (ex: <i>, <sup>) des titres/résumés pour les balises meta
const stripHtml = (str) => (str ? str.replace(/<[^>]*>/g, "").trim() : "");

// Génère les métadonnées Open Graph / Twitter pour les aperçus sur les réseaux sociaux
export const Head = ({ data, location }) => {
  const { siteUrl, title: siteName } = data.site.siteMetadata;
  const { frontmatter, fields, excerpt } = data.markdownRemark;

  const title = stripHtml(frontmatter.title);
  const description = stripHtml(frontmatter.abstract) || excerpt;
  const url = `${siteUrl}${location.pathname}`;

  // Chemin de l'image redimensionnée (1200x630, format recommandé) ou image brute
  const imagePath = fields.image?.childImageSharp?.resize?.src ?? fields.image?.publicURL;
  const imageUrl = imagePath ? `${siteUrl}${imagePath}` : null;

  return (
    <>
      <title>{`${title} | ${siteName}`}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      {/* Open Graph (Facebook, LinkedIn, WhatsApp, Mastodon…) */}
      <meta property="og:type" content="article" />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      {imageUrl && <meta property="og:image" content={imageUrl} />}
      {imageUrl && fields.image?.childImageSharp && (
        <>
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        </>
      )}

      {/* Twitter / X */}
      <meta name="twitter:card" content={imageUrl ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}
    </>
  );
};

export default BlogPost;
