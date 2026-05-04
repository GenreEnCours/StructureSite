import * as React from "react";
import LogoSound from "../images/logo-sound.png";

export const Introduction = () => {
  return (
    <div className="landing-block text">
      <h2>Genre en Cours</h2>
      <p>
        Ce site est le site de Genre en Cours. Il a pour vocation de Lorem ipsum
        dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
        incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
        quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
        consequat. Duis aute irure dolor in reprehenderit in voluptate velit
        esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat
        cupidatat non proident, sunt in culpa qui officia deserunt mollit anim
        id est laborum.
      </p>
      <p>
        Je me suis dit qu'un code couleur en fonction du public visé pourrait
        être pertinent pour se repérer dans la navigation du site. On pourrait
        décrire ici le code couleur utilisé en quelques mots.
      </p>
    </div>
  );
};

export const Footer = () => (
  <footer id="footer">
    <div className="footer-block">
      <p>
        Genre en Cours est une initiative portée par le réseau {" "}
        <a href="https://philomel.hypotheses.org/">Philomel</a> de l'Alliance
        Sorbonne Université et accompagnée par le{" "}
        <a href="https://ceres.sorbonne-universite.fr/">CERES</a>.
      </p>
    </div>
    <div className="footer-block">
      <p>
        Pour nous contacter :{" "}
        <a href="mailto:genre.en.cours@gmail.com">genre.en.cours@gmail.com</a>
      </p>
    </div>
    <a href="https://lettres.sorbonne-universite.fr/" style={{ width: "50vw" }}>
      <img src={LogoSound}></img>
    </a>
  </footer>
);
