import { Link } from "gatsby";
import { GatsbyImage, getImage } from "gatsby-plugin-image";
import * as React from "react";
import { Tag } from "./layout";
import Markdown from "react-markdown";

export const Card = ({ postData, toggleTag, selectedTags }) => {
  const { date, slug, image, collection, prettyName } = postData.fields;
  const { title, tags, abstract, uuid, author } = postData.frontmatter;
  const content = abstract ? abstract : postData.excerpt;

  return (
    <div className="small-card">
      <Link className="card-link" to={`/${prettyName ? prettyName : uuid}`} />
      {image ? (
        <GatsbyImage
          image={getImage(image)}
          alt={title}
          layout="fullWidth"
          className="image-card"
          imgClassName="image-card-img"
          objectFit="cover"
          objectPosition="50% 50%"
        />
      ) : (
        <div className="image-card" />
      )}
      <h4 dangerouslySetInnerHTML={{ __html: title }} />
      <div className="card-details">
        {author && author.join(", ")}
      </div>
      {tags && (
        <div className="small-tags-container">
          {tags
            ? tags.map((t) => (
                <Tag
                  tagName={t}
                  selectedTags={selectedTags}
                  toggleTag={toggleTag}
                />
              ))
            : ""}
        </div>
      )}
      <p className="text-sample">
        <Markdown>{content}</Markdown>
      </p>
    </div>
  );
};
