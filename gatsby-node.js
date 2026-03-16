const { createFilePath } = require(`gatsby-source-filesystem`)
const path = require(`path`)
const fs = require('fs')
const csv = require('csv-parser');
const { result } = require('lodash');
const { createSlug } = require('./src/utils/utils')
// ON ENRICHIE LES NODES MARKDOWN AVEC DES FIELDS
exports.onCreateNode = ({ node, actions, getNode }) => {
  const { createNodeField } = actions
  
  if (node.internal.type === `MarkdownRemark`) {
    
    const slug = createFilePath({ node, getNode }).replace('/', '')
    
    createNodeField({
      node: node,
      name: `slug`,
      value: slug,
    })
    
    const date = slug.split('_')[0]

    // on ne créé la date que si elle est présente dans le slug
    if(date.match(/\d{4}-\d{2}-\d{2}/)){
      createNodeField({
        node: node,
        name: `date`,
        value: date,
      })
    }

    const parent = getNode(node.parent)
    const collection = parent.sourceInstanceName

    createNodeField({
      node: node,
      name: `collection`,
      value: collection,
    })

    // pour les membres on créé une jolie url même si pas de prettyName
    // pour ceux ayant déjà un prettyName on le rajoute dans leurs fields
    if (collection === 'membres' && node.frontmatter.title) {
      createNodeField({
        node: node,
        name: `prettyName`,
        value: createSlug(node.frontmatter.title),
      })
    } else if (node.frontmatter.prettyName) {
      createNodeField({
        node: node,
        name: `prettyName`,
        value: node.frontmatter.prettyName,
      })
    }

    let images = []
    if(node.frontmatter.image){
      images = [path.join(path.dirname(node.fileAbsolutePath), node.frontmatter.image)]
    }
    else{
      const files = fs.readdirSync(path.dirname(node.fileAbsolutePath)).filter(el => el !== 'index.md')
      images = files
      .filter(el => el.endsWith('.png') || el.endsWith('.jpeg') || el.endsWith('.jpg') || el.endsWith('.webp'))
      .map(el => path.join(path.dirname(node.fileAbsolutePath), el))
    }
    // const sounds = files.filter(el => el.endsWith('.mp3') || el.endsWith('.wav') || el.endsWith('.ogg'))
    
    createNodeField({
      node: node,
      name: "image",
      value: images[0] ?? null
    })
  }
}

exports.createPages = async ({ graphql, actions }) => {
  const dict_prettyNames = {}
  const { createPage, createRedirect } = actions

  ////////////////////////////////////////////////////////////////////////////////
  // BLOG POSTS
  ////////////////////////////////////////////////////////////////////////////////

  const result = await graphql(
    `
      {
        site {
          siteMetadata {
            pages
            authors
          }
        }
        allMarkdownRemark(sort: {fields: {date: DESC}}, limit: 999) {
          edges {
            node {
              fields {
                slug
                date
                collection
                prettyName
              }
              frontmatter {
                title
                uuid
              }
            }
          }
        }
      }
    `
  )

  if (result.errors) {
    throw result.errors
  }

  // Create all main pages except Accueil
  const pagesToCreate = result.data.site.siteMetadata.pages

  pagesToCreate.forEach(page => {
    const [_, template, pageName] = page.split('_')

    createPage({
      path: `/${pageName}/`,
      component: path.resolve(`./src/templates/${template}.jsx`),
      context: {
        pageName: pageName
      },
    })
  })

  result.data.allMarkdownRemark.edges.forEach((edge, index) => {
    const fields = edge.node.fields;
    const uuid = edge.node.frontmatter.uuid;
    const prettyName = fields.prettyName;
    
    console.log(prettyName);

    if(fields.slug === "") return;
  
    // Détermine le template selon la collection
    const isMember = fields.collection === 'membres'; // adapte le nom si besoin
    const template = isMember ? 'member.jsx' : 'blog-post.jsx';
    const component = path.resolve(`./src/templates/${template}`);

    const context = isMember
    ? { slug: fields.slug, authorName: edge.node.frontmatter.title }
    : { slug: fields.slug };
  
    createPage({ path: `/${uuid}`, component, context });
  
    if (prettyName) {
      if (prettyName in dict_prettyNames) {
        throw Error(`Pretty name ${prettyName} already exists, clash between ${dict_prettyNames[prettyName]} and ${uuid}`);
      }
      dict_prettyNames[prettyName] = uuid;
      createPage({ path: `/${prettyName}`, component, context });
      createPage({ path: `/${prettyName}/`.toLowerCase(), component, context });
    }
  });

}



// définir le schéma graphql pour éviter les erreurs de champs manquants
exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions
  const typeDefs = `
    type MarkdownRemark implements Node {
      frontmatter: Frontmatter
      fields: MarkdownRemarkFields
    }
    type MarkdownRemarkFields {
      slug: String,
      date: Date @dateformat
      collection: String
      prettyName: String
      image: File @link(by: "absolutePath")
    }
    type Frontmatter {
      tags: [String!]
      sound: String
      author: [String],
      title: String!
      event: Boolean,
      uuid: String!,
      prettyName: String
    }
  `
  createTypes(typeDefs)
}
