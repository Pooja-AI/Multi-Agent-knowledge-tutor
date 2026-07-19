import { Link } from "react-router-dom";
import { FaDatabase } from "react-icons/fa";
import logo from "../assets/logo.png";

function Navbar() {
  return (
    <nav className="navbar">
      <div className="logo">
        <img src={logo} alt="IC Logo" className="logo-icon" />

        <Link to="/" className="logo-text">
          <span className="logo-white">IntelliCatalyst</span>
          <span className="logo-blue">AI Labs</span>
        </Link>
      </div>

      <div className="menu">
        <a
          href="https://pooja-ai.github.io/IntelliCatalyst-Labs/#/"
        >
          Home
        </a>

        <a
          href="https://pooja-ai.github.io/IntelliCatalyst-Labs/#/projects"
         
        >
          Projects
        </a>

        <a
          href="https://pooja-ai.github.io/IntelliCatalyst-Labs/#/books"
        >
          Books
        </a>

        <a
          href="https://pooja-ai.github.io/IntelliCatalyst-Labs/#/about"
        >
          About
        </a>
      </div>
    </nav>
  );
}

export default Navbar;