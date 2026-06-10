import { Link, graphql } from "gatsby";
import * as React from "react";
import Layout from "../components/layout";
import Markdown from "react-markdown";
import { createSlug } from "../utils/utils";
import "../style/article.css";
import LogoEHNE from "../images/Logo_EHNE.png";
import LogoMNHN from "../images/MNHN-logo.jpg";

const PARTNERSHIPS = {
  "partenariat MNHN": {
    name: "MNHN",
    logo: LogoMNHN,
    url: "https://www.mnhn.fr/fr",
  },
  "partenariat EHNE": {
    name: "EHNE",
    logo: LogoEHNE,
    url: "https://ehne.fr/fr",
  },
};

const BlogPost = ({ data, children }) => {
  const date = data.markdownRemark.fields.date;
  const { author, title, tags, abstract, sound } =
    data.markdownRemark.frontmatter;

  // Détecte les partenariats actifs selon les tags
  const activePartnerships = tags
    ? tags.filter((tag) => PARTNERSHIPS[tag]).map((tag) => PARTNERSHIPS[tag])
    : [];

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
                  <a href={partner.url}>
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
      excerpt(pruneLength: 160)
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
      }
      tableOfContents
    }
  }
`;

export default BlogPost;
