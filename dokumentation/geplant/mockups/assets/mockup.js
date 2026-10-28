// Verhalten der Mockups: Reiter und Schritte, Menü und Suche auf dem Handy, Dialoge,
// bedingte Statistikfelder, Zähler und der Sprachumschalter DE/EN.
(function () {
  'use strict';

  // ---------- Sprache ----------
  var SCHLUESSEL = 'forga-mockup-sprache';
  var original = new WeakMap();   // Textknoten -> deutscher Text
  var ATTRIBUTE = ['placeholder', 'title', 'aria-label', 'alt', 'data-label'];
  var dokTitel = document.title;

  function normal(s) { return s.replace(/\s+/g, ' ').trim(); }

  function uebersetze(text) {
    var kern = normal(text);
    if (!kern) return null;
    var w = window.FORGA_EN || {};
    if (Object.prototype.hasOwnProperty.call(w, kern)) return w[kern];
    var muster = window.FORGA_EN_MUSTER || [];
    for (var i = 0; i < muster.length; i++) {
      var re = new RegExp('^' + muster[i][0] + '$');
      var m = kern.match(re);
      if (m) {
        // $1 = Gruppe unverändert, %1 = Gruppe ebenfalls übersetzen
        return muster[i][1].replace(/([$%])(\d)/g, function (_, art, n) {
          var g = m[parseInt(n, 10)] || '';
          if (art === '$') return g;
          var t = uebersetze(g);
          return t === null ? g : t;
        });
      }
    }
    return null;
  }

  function ersetze(text, neu) {
    var vorne = text.match(/^\s*/)[0], hinten = text.match(/\s*$/)[0];
    return vorne + neu + hinten;
  }

  function ausgeschlossen(el) {
    return el.closest('script, style, textarea, [translate="no"]');
  }

  function setzeSprache(sprache) {
    var en = sprache === 'en';
    var gang = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var knoten;
    while ((knoten = gang.nextNode())) {
      if (!knoten.parentElement || ausgeschlossen(knoten.parentElement)) continue;
      if (!original.has(knoten)) original.set(knoten, knoten.nodeValue);
      var de = original.get(knoten);
      if (en) {
        var t = uebersetze(de);
        knoten.nodeValue = t === null ? de : ersetze(de, t);
      } else {
        knoten.nodeValue = de;
      }
    }
    ATTRIBUTE.forEach(function (attr) {
      document.querySelectorAll('[' + attr + ']').forEach(function (el) {
        if (ausgeschlossen(el)) return;
        var merk = 'data-de-' + attr;
        if (!el.hasAttribute(merk)) el.setAttribute(merk, el.getAttribute(attr));
        var de = el.getAttribute(merk);
        var t = en ? uebersetze(de) : null;
        el.setAttribute(attr, t === null ? de : t);
      });
    });
    var teile = dokTitel.split(' · ');
    var tt = en ? uebersetze(teile[0]) : null;
    document.title = (tt === null ? teile[0] : tt) + (teile.length > 1 ? ' · ' + teile.slice(1).join(' · ') : '');
    document.documentElement.lang = en ? 'en' : 'de';
    document.querySelectorAll('[data-sprache]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-sprache') === sprache ? 'true' : 'false');
    });
    try { localStorage.setItem(SCHLUESSEL, sprache); } catch (e) { /* ohne Speicher: Auswahl gilt nur für diese Seite */ }
  }

  function gespeicherteSprache() {
    try { return localStorage.getItem(SCHLUESSEL); } catch (e) { return null; }
  }

  // ---------- Bedingte Statistikfelder ----------
  function aktualisiereBedingt() {
    document.querySelectorAll('[data-wenn]').forEach(function (block) {
      var teile = block.getAttribute('data-wenn').split('=');
      var gewaehlt = document.querySelector('input[name="' + teile[0] + '"]:checked');
      block.hidden = !(gewaehlt && teile[1].split('|').indexOf(gewaehlt.value) >= 0);
    });
    // TH-Rangfolge: die kleinste angekreuzte Nummer zählt
    document.querySelectorAll('[data-rang-ergebnis]').forEach(function (aus) {
      var gruppe = document.getElementById(aus.getAttribute('data-rang-ergebnis'));
      var erster = gruppe && gruppe.querySelector('input:checked');
      aus.textContent = erster ? erster.closest('label').querySelector('.th-name').textContent : '–';
      if (document.documentElement.lang === 'en') {
        var t = uebersetze(aus.textContent);
        if (t !== null) aus.textContent = t;
      }
    });
  }

  // ---------- Klicks ----------
  document.addEventListener('click', function (e) {
    var sp = e.target.closest('[data-sprache]');
    if (sp) { setzeSprache(sp.getAttribute('data-sprache')); return; }

    var knopf = e.target.closest('[data-reiter]');
    if (knopf) {
      var gruppe = knopf.closest('[data-reitergruppe]');
      var ziel = knopf.getAttribute('data-reiter');
      gruppe.querySelectorAll('.schritte [data-reiter], .reiter [data-reiter]').forEach(function (b) {
        var an = b.getAttribute('data-reiter') === ziel;
        b.classList.toggle('aktiv', an);
        b.setAttribute('aria-current', an ? 'step' : 'false');
      });
      gruppe.querySelectorAll('.reiter-inhalt').forEach(function (p) {
        p.classList.toggle('aktiv', p.id === ziel);
      });
      var titel = gruppe.querySelector('.schritt-titel');
      var aktiv = gruppe.querySelector('.schritte [data-reiter="' + ziel + '"] .text');
      if (titel && aktiv) titel.textContent = aktiv.textContent;
      if (knopf.hasAttribute('data-nach-oben')) window.scrollTo(0, 0);
      return;
    }

    var dlg = e.target.closest('[data-dialog]');
    if (dlg) {
      e.preventDefault();
      var d = document.getElementById(dlg.getAttribute('data-dialog'));
      if (d && d.showModal) d.showModal();
      return;
    }

    var um = e.target.closest('[data-zaehler]');
    if (um) {
      var feld = um.parentElement.querySelector('input');
      var v = (parseInt(feld.value, 10) || 0) + parseInt(um.getAttribute('data-zaehler'), 10);
      feld.value = Math.max(0, v);
      return;
    }

    var menue = e.target.closest('.menue-knopf');
    if (menue) {
      var offen = document.body.classList.toggle('menue-offen');
      menue.setAttribute('aria-expanded', offen ? 'true' : 'false');
      return;
    }
    if (e.target.closest('.such-knopf')) {
      document.body.classList.toggle('suche-offen');
      var s = document.getElementById('globale-suche');
      if (s && document.body.classList.contains('suche-offen')) s.focus();
      return;
    }
    if (document.body.classList.contains('menue-offen') && !e.target.closest('.seitenleiste')) {
      document.body.classList.remove('menue-offen');
    }
    // Benutzermenü schließen, wenn außerhalb geklickt
    document.querySelectorAll('details.benutzermenue[open]').forEach(function (m) {
      if (!m.contains(e.target)) m.removeAttribute('open');
    });
  });

  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-umschalten]')) {
      document.body.classList.toggle(e.target.getAttribute('data-umschalten'), e.target.checked);
    }
    if (e.target.matches('input[type=radio], input[type=checkbox]')) aktualisiereBedingt();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('menue-offen')) {
      document.body.classList.remove('menue-offen');
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    aktualisiereBedingt();
    // ?sprache=en im Link hat Vorrang (zum Teilen und Prüfen), sonst die gespeicherte Wahl
    var url = (location.search.match(/[?&]sprache=(de|en)/) || [])[1];
    var sprache = url || gespeicherteSprache();
    if (sprache === 'en') setzeSprache('en');
    // Mockup: #dialog-id öffnet einen Dialog direkt, #s4 springt zu einem Schritt
    var h = location.hash.slice(1);
    if (h) {
      var el = document.getElementById(h);
      if (el && el.tagName === 'DIALOG' && el.showModal) el.showModal();
      // #id einer Auswahl (z. B. #bereitschaft) wählt sie aus und zeigt die passende Variante
      if (el && el.tagName === 'INPUT') { el.checked = true; aktualisiereBedingt(); }
      var schritt = document.querySelector('[data-reiter="' + h + '"]');
      if (schritt) schritt.click();
    }
  });
})();
