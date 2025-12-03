/**
 * Gyde Experts Mega Menu JavaScript
 * Add this to your Webflow site before </body>
 */

(function() {
  'use strict';

  // Wait for DOM to be ready
  function init() {
    const nav = document.querySelector('.gyde-mega-nav');
    if (!nav) return;

    const mobileToggle = nav.querySelector('.gyde-mobile-toggle');
    const megaItems = nav.querySelectorAll('.gyde-has-mega');

    // Mobile menu toggle
    if (mobileToggle) {
      mobileToggle.addEventListener('click', function() {
        nav.classList.toggle('is-mobile-open');
        document.body.style.overflow = nav.classList.contains('is-mobile-open') ? 'hidden' : '';
      });
    }

    // Mobile: Toggle mega menu on click
    megaItems.forEach(function(item) {
      const link = item.querySelector('.gyde-nav-link');

      link.addEventListener('click', function(e) {
        // Only prevent default on mobile
        if (window.innerWidth <= 1024) {
          e.preventDefault();
          item.classList.toggle('is-open');
        }
      });
    });

    // Desktop: Close mega menu when clicking outside
    document.addEventListener('click', function(e) {
      if (window.innerWidth > 1024) {
        if (!e.target.closest('.gyde-has-mega')) {
          megaItems.forEach(function(item) {
            item.classList.remove('is-open');
          });
        }
      }
    });

    // Close mobile menu on resize to desktop
    window.addEventListener('resize', function() {
      if (window.innerWidth > 1024) {
        nav.classList.remove('is-mobile-open');
        document.body.style.overflow = '';
        megaItems.forEach(function(item) {
          item.classList.remove('is-open');
        });
      }
    });

    // Keyboard accessibility
    megaItems.forEach(function(item) {
      const link = item.querySelector('.gyde-nav-link');

      link.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.classList.toggle('is-open');
        }
        if (e.key === 'Escape') {
          item.classList.remove('is-open');
        }
      });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
