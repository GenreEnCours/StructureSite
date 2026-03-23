import { graphql } from "gatsby"
import * as React from 'react'
import { Card } from "../components/card"
import Layout from '../components/layout'
import { filterNodes } from "../helpers"
import { Introduction } from '../components/customisation'
import Planet from '../images/baniere.jpg'

import LogoSorbonne from '../images/lettres-logo-white.svg'
import LogoLabo from '../images/LogoLabo.png'

import "../style/accueil.css"


const Home = ({ data }) => {
    const nodes = data.allMarkdownRemark.nodes
    const lastPosts = React.useRef(null)

    return (
        <Layout nodes={nodes}>
            {/* petite astuce pour passer une fonction qui rend le composant actuel au layout pour que le layout puisse passer les paramètres nécessaires au filtrage*/}
            {(toggleTag, tags, search) => { 
                const filtered = filterNodes(nodes, search, tags);
                if (lastPosts && lastPosts.current && filtered.length !== nodes.length) {
                    lastPosts.current.scrollIntoView()
                }
                return (
                    <div>
                        <HomeHeader nodes={nodes} />
                        <h2 ref={lastPosts} id="last-posts">Dernières publications</h2>
                        <div id="cards-container">
                            {filtered.map((el, index) => <Card postData={el} key={index} toggleTag={toggleTag} selectedTags={tags} />)}
                        </div>
                    </div>
                )
            }
            }
        </Layout>
    )
}

const HomeHeader = ({ nodes }) => {
    const [imageClass, setImageClass] = React.useState("")
    const [contentWord, setContentWord] = React.useState("apprendre")
    const [fadeClass, setFadeClass] = React.useState("fade-in")
    const possibleContentWords = ["bricoler ensemble", "se former", "s'informer", "transformer nos pratiques"]
    React.useEffect(() => {
        const interval = setInterval(() => {
            // Déclenche le fondu de sortie
            setFadeClass("fade-out")
            
            // Attend la fin du fondu avant de changer le mot
            setTimeout(() => {
                // Choisit un nouveau mot différent du mot actuel
                const currentIndex = possibleContentWords.indexOf(contentWord)
                const availableWords = possibleContentWords.filter((_, index) => index !== currentIndex)
                const newWord = availableWords[Math.floor(Math.random() * availableWords.length)]
                setContentWord(newWord)
                
                // Déclenche le fondu d'entrée
                setFadeClass("fade-in")
            }, 300) // Durée du fondu de sortie
        }, 2000)
        
        return () => clearInterval(interval)
    }, [contentWord])
    
    React.useEffect(() => {
        setTimeout(() => setImageClass('full'), 0)
    }, [])

    return (<header className="landing-header">
        <div className="image-container">
            {/* <img id="landing-image" src={Planet} style={{ maxWidth: "100%", margin: 0 }} className={imageClass} /> */}
            {/* <div class="gradient-overlay"></div> */}
            <h1 style={{color: "white"}}>
                    Outils et ressources pour {' '}
                    <span className="rotating-word-container">
                        <span className={`rotating-word ${fadeClass}`}>
                            {contentWord}
                        </span>
                    </span>
                </h1>
            <img id="landing-logo" src={LogoLabo} style={{ maxWidth: "100%", margin: 0 }} />
            {/* <img id="landing-sorbonne" src={LogoSorbonne} style={{ maxWidth: "100%", margin: 0, height: "194px", width: "500px" }} /> */}
        </div>

        {/* <div id="landing-blocks-container">
            <Introduction />
        </div> */}
    </header>)
}

export const query = graphql`
  query MyQuery {
    site {
        siteMetadata {
            title,
            googleVerification
        }
    }
    allMarkdownRemark(sort: {fields: {date: DESC}}, filter: {fields: {date: {ne: null}}}, limit: 999) {
        nodes {
            frontmatter {
                tags
                title
                author
                abstract
                sound
                event
                uuid
                prettyName
            }
            fields {
                collection
                date(formatString: "DD MMMM, YYYY", locale: "fr")
                dateRaw: date
                slug
                image {
                    childImageSharp {
                        gatsbyImageData(placeholder: TRACED_SVG, width: 400)
                    }
                }
            }
            excerpt(pruneLength: 600)
        }
    }
}

`

export default Home

export const Head = ({ data }) => {
    const { title, description, googleVerification } = data.site.siteMetadata
  
    return (
      <>
        <title>{title}</title>
        <meta name="description" content={description} />
        {googleVerification && (
          <meta
            name="google-site-verification"
            content={googleVerification}
          />
        )}
      </>
    )
  }