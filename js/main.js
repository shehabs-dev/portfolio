// ============================================
// PORTFOLIO JAVASCRIPT - Shehab Saber
// ============================================

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  
  // ========== MOBILE MENU TOGGLE ==========
  const menuBtn = document.getElementById('menu');
  const navList = document.getElementById('action');

  if (menuBtn && navList) {
    menuBtn.addEventListener('click', function() {
      navList.classList.toggle('active');
      menuBtn.classList.toggle('active');
    });

    // Close menu when clicking on a link
    const navLinks = document.querySelectorAll('#action a');
    navLinks.forEach(function(link) {
      link.addEventListener('click', function() {
        navList.classList.remove('active');
        menuBtn.classList.remove('active');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(event) {
      const isClickInsideNav = navList.contains(event.target);
      const isClickOnMenu = menuBtn.contains(event.target);
      
      if (!isClickInsideNav && !isClickOnMenu && navList.classList.contains('active')) {
        navList.classList.remove('active');
        menuBtn.classList.remove('active');
      }
    });
  }

  // ========== NAVBAR SCROLL EFFECT ==========
  const navbar = document.getElementById('navbar');
  
  window.addEventListener('scroll', function() {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // ========== SMOOTH SCROLL FOR ANCHOR LINKS ==========
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  
  anchorLinks.forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      // Only prevent default for internal links (not just "#")
      if (href !== '#' && href.length > 1) {
        e.preventDefault();
        const target = document.querySelector(href);
        
        if (target) {
          const offsetTop = target.offsetTop - 80; // Offset for fixed navbar
          
          window.scrollTo({
            top: offsetTop,
            behavior: 'smooth'
          });
        }
      }
    });
  });

  // ========== ACTIVE NAV LINK ON SCROLL ==========
  const sections = document.querySelectorAll('section[id]');
  const navItems = document.querySelectorAll('nav ul li a');

  function setActiveNavLink() {
    let currentSection = '';
    
    sections.forEach(function(section) {
      const sectionTop = section.offsetTop - 100;
      const sectionHeight = section.offsetHeight;
      
      if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
        currentSection = section.getAttribute('id');
      }
    });

    navItems.forEach(function(item) {
      item.classList.remove('active');
      if (item.getAttribute('href') === '#' + currentSection) {
        item.classList.add('active');
      }
    });
  }

  window.addEventListener('scroll', setActiveNavLink);

  // ========== SCROLL ANIMATIONS (FADE IN ON SCROLL) ==========
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe cards and sections
  const cards = document.querySelectorAll('.card');
  const skills = document.querySelectorAll('.skill');
  
  cards.forEach(function(card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = 'all 0.6s ease';
    observer.observe(card);
  });

  skills.forEach(function(skill) {
    skill.style.opacity = '0';
    skill.style.transform = 'translateY(20px)';
    skill.style.transition = 'all 0.5s ease';
    observer.observe(skill);
  });

  // ========== TYPING EFFECT (OPTIONAL) ==========
  // Uncomment this section if you want a typing effect on the hero text
  /*
  const typingText = document.querySelector('.container-texts h3 span');
  if (typingText) {
    const text = typingText.textContent;
    typingText.textContent = '';
    let i = 0;
    
    function typeWriter() {
      if (i < text.length) {
        typingText.textContent += text.charAt(i);
        i++;
        setTimeout(typeWriter, 100);
      }
    }
    
    setTimeout(typeWriter, 500);
  }
  */

  // ========== PRELOADER (OPTIONAL) ==========
  // Add this HTML before closing body tag if you want a preloader:
  // <div id="preloader"><div class="spinner"></div></div>
  /*
  const preloader = document.getElementById('preloader');
  if (preloader) {
    window.addEventListener('load', function() {
      preloader.style.opacity = '0';
      setTimeout(function() {
        preloader.style.display = 'none';
      }, 500);
    });
  }
  */

  // ========== SCROLL TO TOP BUTTON (OPTIONAL) ==========
  // Create a scroll-to-top button
  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
  scrollTopBtn.id = 'scrollTopBtn';
  scrollTopBtn.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    background: #f9004d;
    color: white;
    border: none;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    font-size: 20px;
    cursor: pointer;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
    z-index: 999;
    box-shadow: 0 5px 15px rgba(249, 0, 77, 0.4);
  `;
  
  document.body.appendChild(scrollTopBtn);

  // Show/hide scroll to top button
  window.addEventListener('scroll', function() {
    if (window.scrollY > 300) {
      scrollTopBtn.style.opacity = '1';
      scrollTopBtn.style.visibility = 'visible';
    } else {
      scrollTopBtn.style.opacity = '0';
      scrollTopBtn.style.visibility = 'hidden';
    }
  });

  // Scroll to top when clicked
  scrollTopBtn.addEventListener('click', function() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

  scrollTopBtn.addEventListener('mouseenter', function() {
    this.style.transform = 'scale(1.1)';
  });

  scrollTopBtn.addEventListener('mouseleave', function() {
    this.style.transform = 'scale(1)';
  });

  // ========== CONSOLE MESSAGE ==========
  console.log('%c Portfolio Website ', 'background: #f9004d; color: white; font-size: 20px; padding: 10px;');
  console.log('%c Developed by Shehab Saber ', 'background: #0a0a0a; color: #f9004d; font-size: 14px; padding: 5px;');
  
});