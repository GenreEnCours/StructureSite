const fs = require("fs");
const path = require("path");

const DIR = "./src/data";
const MEMBERS_DIR = "./src/data/3_cards_membres";

const folders = fs.readdirSync(DIR);
const members = fs.readdirSync(MEMBERS_DIR);

const siteConfig = JSON.parse(fs.readFileSync("siteConfig.json", "utf8"));

let config = {
  siteMetadata: {
    ...siteConfig,
    authors: [],
    pages: [],
  },
  plugins: [
    "gatsby-plugin-emotion",
    "gatsby-plugin-image",
    "gatsby-plugin-sitemap",
    {
      resolve: "gatsby-plugin-manifest",
      options: {
        icon: "src/images/" + siteConfig["logo"],
      },
    },
    "gatsby-plugin-sharp",
    "gatsby-transformer-sharp",
    {
      resolve: `gatsby-transformer-remark`,
      options: {
        footnotes: true,
        plugins: [
          // `gatsby-remark-copy-linked-files`,
          {
            resolve: `gatsby-remark-images`,
            options: {
              maxWidth: 650,
              loading: "lazy", // garde le lazy loading natif du navigateur
              disableBgImage: true,
              showCaptions: ["alt", "title"],
              // markdownCaptions: true,
              // maxWidth: 650
            },
          },
          {
            resolve: `gatsby-remark-copy-linked-files`,
            options: {
              ignoreFileExtensions: [],
            },
          },
          {
            resolve: `gatsby-remark-responsive-iframe`,
            // options: {
            //   wrapperStyle: `margin-bottom: 1.0725rem`,
            // },
          },
          `gatsby-remark-prismjs`,
          `gatsby-remark-smartypants`,
          `gatsby-remark-autolink-headers`,
        ],
      },
    },
    {
      resolve: "gatsby-source-filesystem",
      options: {
        name: "images",
        path: "./src/images/",
      },
      __key: "images",
    },
    // {
    //   resolve: `gatsby-transformer-csv`,
    // }
  ],
};

console.log(folders);
folders.forEach((folder) => {
  if (
    !folder.startsWith("_") &&
    fs.statSync(path.join(DIR, folder)).isDirectory() &&
    folder !== ".git" &&
    folder !== ".github"
  ) {
    config.plugins.push({
      resolve: "gatsby-source-filesystem",
      options: {
        name: folder.split("_")[2],
        path: path.join(DIR, folder),
      },
      // ignore: [`**/*.csv`, '*.csv', '**\\*.csv', '**\\*\.csv', '**\*.csv', path.join(DIR, folder, '2024-02-08_Tutoriel_tableau_Public', 'Fichier_Atelier.csv')]
    });
    config.siteMetadata.pages.push(folder);
  }
});

if (members) {
  members.forEach((member) => {
    if (
      fs.statSync(path.join(MEMBERS_DIR, member)).isDirectory() &&
      member !== ".git" &&
      member !== ".github"
    ) {
      config.siteMetadata.authors.push(member);
    }
  });
}

module.exports = config;
