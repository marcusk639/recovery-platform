import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import styled from "styled-components";

const HeaderContainer = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background-color: white;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;

  &.scrolled {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }
`;

const NavContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const Logo = styled(Link)`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color);
  display: flex;
  align-items: center;

  &:hover {
    text-decoration: none;
  }
`;

const NavLinks = styled.nav`
  display: flex;
  align-items: center;

  @media (max-width: 768px) {
    display: ${({ $isOpen }) => ($isOpen ? "flex" : "none")};
    flex-direction: column;
    position: absolute;
    top: 70px;
    left: 0;
    right: 0;
    background-color: white;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    padding: 1rem;
  }
`;

const NavLink = styled(Link)`
  margin-left: 1.5rem;
  color: var(--text-dark);
  font-weight: 500;
  position: relative;

  &:after {
    content: "";
    position: absolute;
    bottom: -4px;
    left: 0;
    right: 0;
    height: 2px;
    background-color: var(--primary-color);
    transform: scaleX(0);
    transition: transform 0.3s ease;
  }

  &.active:after,
  &:hover:after {
    transform: scaleX(1);
  }

  @media (max-width: 768px) {
    margin: 0.5rem 0;
  }
`;

const MobileMenuButton = styled.button`
  display: none;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-dark);

  @media (max-width: 768px) {
    display: block;
  }
`;

const CtaButton = styled(Link)`
  background-color: var(--primary-color);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  margin-left: 1.5rem;
  font-weight: 500;

  &:hover {
    background-color: var(--primary-dark);
    text-decoration: none;
  }

  @media (max-width: 768px) {
    margin: 0.5rem 0;
  }
`;

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <HeaderContainer className={scrolled ? "scrolled" : ""}>
      <NavContainer>
        <Logo to="/">Homegroups</Logo>

        <MobileMenuButton onClick={toggleMenu}>
          {isOpen ? "✕" : "☰"}
        </MobileMenuButton>

        <NavLinks $isOpen={isOpen}>
          <NavLink to="/" className={location.pathname === "/" ? "active" : ""}>
            Home
          </NavLink>
          <NavLink
            to="/features"
            className={location.pathname === "/features" ? "active" : ""}
          >
            Features
          </NavLink>
          <NavLink
            to="/pricing"
            className={location.pathname === "/pricing" ? "active" : ""}
          >
            Pricing
          </NavLink>
          <NavLink
            to="/about"
            className={location.pathname === "/about" ? "active" : ""}
          >
            About
          </NavLink>
          <CtaButton to="/contact">Get Started</CtaButton>
        </NavLinks>
      </NavContainer>
    </HeaderContainer>
  );
};

export default Header;
