/* Yıllık plan (.docx) ayıklayıcı: saf işlevler (arayüzden bağımsız, Node'da test edilir: testler/test_plan.mjs).
 * .docx = zip; içinden word/document.xml okunur (kendi deflate açıcımız: eski WebView'lerde DecompressionStream yok, dış kütüphane yok).
 * Tablo başlık satırından sütunlar bulunur (TARİH, HAFTA, SÜREÇ BİLEŞENLERİ ...). Bulunamazsa ayıklayıcı TAHMİN ETMEZ:
 * { tamam:false, hata:"sutun", adaylar:[...] } döner, arayüz hangi sütun olduğunu sordurur.
 * Çıktı: { tamam, baslik:{ders,seviye,yil}, haftalar:[{no,tarih,baslangic,bitis,saat,tema,konu,bilesen:[satırlar],etkinlik}], ozel:[tatil vb.], uyarilar }
 */
(function (genel) {
  "use strict";

  var AYLAR = { ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12 };
  var EN_COK_DOSYA = 30 * 1024 * 1024;

  // ───────────── yardımcılar ─────────────
  function sade(s) { // küçük harf + Türkçe harfler ASCII: karşılaştırma için
    return String(s == null ? "" : s).toLocaleLowerCase("tr-TR")
      .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
      .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u").replace(/\s+/g, " ").trim();
  }
  function iki(n) { return (n < 10 ? "0" : "") + n; }
  function iso(y, m, d) { return y + "-" + iki(m) + "-" + iki(d); }
  function xmlCoz(s) {
    return s.replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }

  // ───────────── zip okuma ─────────────
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  /** Zip'in merkezi dizininden dosya listesi: [{ad, yontem, sikisikBoyut, boyut, yer}] */
  function zipListe(b) {
    if (!b || b.length < 22 || b[0] !== 0x50 || b[1] !== 0x4b) throw new Error("Bu dosya bir .docx (Word) dosyası değil.");
    if (b.length > EN_COK_DOSYA) throw new Error("Dosya çok büyük.");
    var son = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 22 - 65557); i--) {
      if (u32(b, i) === 0x06054b50) { son = i; break; }
    }
    if (son < 0) throw new Error("Zip yapısı okunamadı.");
    var adet = u16(b, son + 10), yer = u32(b, son + 16), liste = [], o = yer;
    for (var k = 0; k < adet; k++) {
      if (u32(b, o) !== 0x02014b50) throw new Error("Zip dizini bozuk.");
      var yontem = u16(b, o + 10), sik = u32(b, o + 20), boy = u32(b, o + 24);
      var adU = u16(b, o + 28), ekU = u16(b, o + 30), yorumU = u16(b, o + 32), yerel = u32(b, o + 42);
      var ad = new TextDecoder("utf-8").decode(b.subarray(o + 46, o + 46 + adU));
      liste.push({ ad: ad, yontem: yontem, sikisikBoyut: sik, boyut: boy, yer: yerel });
      o += 46 + adU + ekU + yorumU;
    }
    return liste;
  }

  // ───────────── deflate açma (RFC 1951): tarayıcı özelliğine bağlı değil ─────────────
  // Eski Android WebView sürümleri (ör. 99) DecompressionStream('deflate-raw') desteklemez; bu yüzden kendi küçük açıcımız kullanılır.
  var LEN_TAN = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EK = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var UZ_TAN = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var UZ_EK = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var KOD_SIRA = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function huffYap(uzunluklar, n) {
    var sayim = new Array(16), sembol = new Array(n), i;
    for (i = 0; i < 16; i++) sayim[i] = 0;
    for (i = 0; i < n; i++) sayim[uzunluklar[i]]++;
    var ofs = new Array(16);
    ofs[1] = 0;
    for (i = 1; i < 15; i++) ofs[i + 1] = ofs[i] + sayim[i];
    for (i = 0; i < n; i++) if (uzunluklar[i] !== 0) sembol[ofs[uzunluklar[i]]++] = i;
    return { sayim: sayim, sembol: sembol };
  }

  /** Ham deflate akışını açar. boyut: beklenen açılmış boyut (zip dizininden). */
  function inflateRaw(src, boyut) {
    var out = new Uint8Array(boyut), op = 0, pos = 0, bitBuf = 0, bitSay = 0;
    function bit(n) {
      var v = bitBuf;
      while (bitSay < n) {
        if (pos >= src.length) throw new Error("Sıkıştırılmış veri yarım kalmış.");
        v |= src[pos++] << bitSay;
        bitSay += 8;
      }
      bitBuf = v >>> n;
      bitSay -= n;
      return v & ((1 << n) - 1);
    }
    function coz(h) {
      var kod = 0, ilk = 0, indeks = 0;
      for (var len = 1; len <= 15; len++) {
        kod |= bit(1);
        var say = h.sayim[len];
        if (kod - say < ilk) return h.sembol[indeks + (kod - ilk)];
        indeks += say; ilk += say; ilk <<= 1; kod <<= 1;
      }
      throw new Error("Sıkıştırılmış veri bozuk.");
    }
    function bloklar(lit, uz) {
      for (;;) {
        var sym = coz(lit);
        if (sym < 256) {
          if (op >= out.length) throw new Error("Açılan veri beklenenden büyük.");
          out[op++] = sym;
        } else if (sym === 256) {
          return;
        } else {
          sym -= 257;
          if (sym >= 29) throw new Error("Sıkıştırılmış veri bozuk.");
          var len = LEN_TAN[sym] + bit(LEN_EK[sym]);
          var d = coz(uz);
          if (d >= 30) throw new Error("Sıkıştırılmış veri bozuk.");
          var dist = UZ_TAN[d] + bit(UZ_EK[d]);
          if (dist > op || op + len > out.length) throw new Error("Sıkıştırılmış veri bozuk.");
          for (var k = 0; k < len; k++) { out[op] = out[op - dist]; op++; }
        }
      }
    }
    var son;
    do {
      son = bit(1);
      var tur = bit(2);
      if (tur === 0) {
        bitBuf = 0; bitSay = 0; // bayta hizala
        if (pos + 4 > src.length) throw new Error("Sıkıştırılmış veri yarım kalmış.");
        var len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8);
        pos += 4;
        if ((len ^ 0xFFFF) !== nlen || pos + len > src.length || op + len > out.length) throw new Error("Sıkıştırılmış veri bozuk.");
        out.set(src.subarray(pos, pos + len), op);
        op += len; pos += len;
      } else if (tur === 1) {
        var l = [], i;
        for (i = 0; i < 144; i++) l[i] = 8;
        for (; i < 256; i++) l[i] = 9;
        for (; i < 280; i++) l[i] = 7;
        for (; i < 288; i++) l[i] = 8;
        var u = [];
        for (i = 0; i < 30; i++) u[i] = 5;
        bloklar(huffYap(l, 288), huffYap(u, 30));
      } else if (tur === 2) {
        var nlit = bit(5) + 257, ndist = bit(5) + 1, ncl = bit(4) + 4, kl = [], j;
        if (nlit > 286 || ndist > 30) throw new Error("Sıkıştırılmış veri bozuk.");
        for (j = 0; j < 19; j++) kl[j] = 0;
        for (j = 0; j < ncl; j++) kl[KOD_SIRA[j]] = bit(3);
        var klh = huffYap(kl, 19), tum = [];
        while (tum.length < nlit + ndist) {
          var s2 = coz(klh);
          if (s2 < 16) tum.push(s2);
          else {
            var tekrar, deger = 0;
            if (s2 === 16) {
              if (!tum.length) throw new Error("Sıkıştırılmış veri bozuk.");
              deger = tum[tum.length - 1]; tekrar = 3 + bit(2);
            } else if (s2 === 17) tekrar = 3 + bit(3);
            else tekrar = 11 + bit(7);
            while (tekrar-- > 0) tum.push(deger);
          }
        }
        if (tum.length !== nlit + ndist || tum[256] === 0) throw new Error("Sıkıştırılmış veri bozuk.");
        bloklar(huffYap(tum.slice(0, nlit), nlit), huffYap(tum.slice(nlit), ndist));
      } else {
        throw new Error("Sıkıştırılmış veri bozuk.");
      }
    } while (!son);
    if (op !== out.length) throw new Error("Açılan veri beklenenden küçük.");
    return out;
  }

  /** Zip içindeki bir dosyanın bayt dizisi. */
  async function zipDosya(b, ad) {
    var girdi = zipListe(b).filter(function (g) { return g.ad === ad; })[0];
    if (!girdi) throw new Error("Dosyada '" + ad + "' yok.");
    if (girdi.boyut > EN_COK_DOSYA) throw new Error("Dosya çok büyük.");
    var o = girdi.yer;
    if (u32(b, o) !== 0x04034b50) throw new Error("Zip girdisi bozuk.");
    var bas = o + 30 + u16(b, o + 26) + u16(b, o + 28);
    var ham = b.subarray(bas, bas + girdi.sikisikBoyut);
    if (girdi.yontem === 0) return ham;
    if (girdi.yontem !== 8) throw new Error("Desteklenmeyen sıkıştırma.");
    return inflateRaw(ham, girdi.boyut);
  }

  async function belgeXml(b) {
    var ham = await zipDosya(b, "word/document.xml");
    return new TextDecoder("utf-8").decode(ham);
  }

  // ───────────── tablo okuma ─────────────
  var SATIR_RE = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g;
  var HUCRE_RE = /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g;
  var PARCA_RE = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>|<\/w:p>/g;

  function hucreMetni(x) {
    var s = "", m;
    PARCA_RE.lastIndex = 0;
    while ((m = PARCA_RE.exec(x)) !== null) {
      if (m[1] !== undefined) s += xmlCoz(m[1]);
      else if (m[0].indexOf("<w:tab") === 0) s += " ";
      else s += "\n";
    }
    return s.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").replace(/^\s+|\s+$/g, "");
  }

  /** document.xml → satırlar; her satır sütun sırasına açılmış hücre dizisi (gridSpan çoğaltılır, vMerge üstten taşınır). */
  function satirlar(xml) {
    var sonuc = [], onceki = [], m;
    SATIR_RE.lastIndex = 0;
    while ((m = SATIR_RE.exec(xml)) !== null) {
      var hucreler = m[0].match(HUCRE_RE) || [];
      var satir = [], poz = 0;
      for (var i = 0; i < hucreler.length; i++) {
        var h = hucreler[i];
        var span = 1, sm = /<w:gridSpan\s+w:val="(\d+)"/.exec(h);
        if (sm) span = Math.max(1, parseInt(sm[1], 10));
        var vm = /<w:vMerge\b([^>]*)\/?>/.exec(h), devam = false;
        if (vm) devam = !/w:val="restart"/.test(vm[1]);
        var metin = hucreMetni(h);
        for (var k = 0; k < span; k++) {
          var c = { metin: metin, ayni: span > 1 || k > 0 };
          if (devam && onceki[poz]) { c.metin = onceki[poz].metin; c.devam = true; }
          satir[poz++] = c;
        }
      }
      onceki = satir;
      if (satir.length) sonuc.push(satir);
    }
    return sonuc;
  }

  // ───────────── tarih ─────────────
  function ayNo(s) { return AYLAR[sade(s)] || 0; }

  /** "09-13 Kasım", "30 Kasım-04 Aralık", "29 Ekim", "12.10.2026-16.10.2026" → {d1,m1,y1,d2,m2,y2} (yıl yoksa 0) ya da null. */
  function aralikOku(metin) {
    var s = sade(metin);
    var n = /(\d{1,2})[./](\d{1,2})[./](\d{4})\s*[-–—]\s*(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
    if (n) return { d1: +n[1], m1: +n[2], y1: +n[3], d2: +n[4], m2: +n[5], y2: +n[6] };
    var r = /(\d{1,2})\s*([a-z]+)?\s*[-–—]\s*(\d{1,2})\s*([a-z]+)/.exec(s);
    if (r) {
      var m2 = ayNo(r[4]), m1 = r[2] ? ayNo(r[2]) : m2;
      if (m1 && m2) return { d1: +r[1], m1: m1, y1: 0, d2: +r[3], m2: m2, y2: 0 };
    }
    var t = /(\d{1,2})\s*([a-z]+)/.exec(s);
    if (t && ayNo(t[2])) { var mm = ayNo(t[2]); return { d1: +t[1], m1: mm, y1: 0, d2: +t[1], m2: mm, y2: 0 }; }
    return null;
  }

  /** Ders yılı [baş, son] verilince ay numarasından yıl: Eylül–Aralık = baş, Ocak–Ağustos = son. */
  function yilKoy(r, yil) {
    var y = function (m, v) { return v || (yil ? (m >= 9 ? yil[0] : yil[1]) : 0); };
    var y1 = y(r.m1, r.y1), y2 = y(r.m2, r.y2);
    return { baslangic: y1 ? iso(y1, r.m1, r.d1) : "", bitis: y2 ? iso(y2, r.m2, r.d2) : "" };
  }

  // ───────────── metin: süreç bileşeni satırları ─────────────
  // Kazanım kodu öneki ("BİY.10.1.2.") atılır; "a) ... b) ..." satırlara ayrılır.
  function bilesenSatirlari(metin) {
    var s = String(metin || "").replace(/\r/g, "");
    s = s.replace(/[A-ZÇĞİÖŞÜ]{2,6}\.\d{1,2}(?:\.\d{1,2}){1,4}\.?\s*(?=[a-zçğıöşü]\))/g, "");
    s = s.replace(/([.!?:;”"')…])\s*(?=[a-zçğıöşü]\)\s)/g, "$1\n");
    var parcalar = s.split(/\n+/).map(function (p) { return p.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    return parcalar;
  }

  // ───────────── başlık ─────────────
  function baslikOku(xml) {
    var once = xml.split(/<w:tbl\b/)[0];
    var s = hucreMetni(once).replace(/\n/g, " ");
    var seviye = 0, ders = "", yil = null, m;
    if ((m = /(\d{1,2})\s*\.?\s*S[Iİ]N[Iİ]F/i.exec(s))) seviye = +m[1];
    if ((m = /S[Iİ]N[Iİ]F\s+(.+?)\s+DERS[Iİ]/i.exec(s))) ders = m[1].replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    if ((m = /(20\d{2})\s*[-–]\s*(20\d{2})/.exec(s))) yil = [+m[1], +m[2]];
    return { seviye: seviye, ders: ders, yil: yil };
  }

  // ───────────── sütun bulma ─────────────
  var BASLIKLAR = [
    ["tarih", /^tarih$/],
    ["hafta", /^hafta$/],
    ["saat", /^(ders )?saat/],
    ["tema", /^(tema|unite)/],
    ["konu", /icerik cercevesi|^konu|alt ogrenme alani/],
    ["kazanim", /ogrenme ciktilari|^kazanim/],
    ["bilesen", /surec bilesen/]
  ];

  function sutunBul(tablo) {
    for (var i = 0; i < tablo.length; i++) {
      var bulunan = {}, say = 0;
      for (var j = 0; j < tablo[i].length; j++) {
        var s = sade(tablo[i][j].metin);
        for (var k = 0; k < BASLIKLAR.length; k++) {
          if (BASLIKLAR[k][1].test(s) && bulunan[BASLIKLAR[k][0]] === undefined) { bulunan[BASLIKLAR[k][0]] = j; say++; break; }
        }
      }
      if (bulunan.tarih !== undefined && say >= 3) return { satir: i, sutunlar: bulunan, basliklar: tablo[i].map(function (c) { return c.metin; }) };
    }
    return null;
  }

  // ───────────── ana işlev ─────────────
  /** secenek: { sutunBilesen: n, sutunTarih: n, yil: [2026, 2027] } (kullanıcı seçtiyse) */
  function ayikla(xml, secenek) {
    secenek = secenek || {};
    var baslik = baslikOku(xml);
    var yil = secenek.yil || baslik.yil;
    var tablo = satirlar(xml);
    var bul = sutunBul(tablo);
    var uyari = [];
    if (!bul) return { tamam: false, hata: "tablo", mesaj: "Planda 'TARİH' başlıklı bir tablo bulunamadı.", baslik: baslik };
    var s = bul.sutunlar;
    if (secenek.sutunTarih !== undefined) s.tarih = secenek.sutunTarih;
    if (secenek.sutunBilesen !== undefined) s.bilesen = secenek.sutunBilesen;
    if (s.bilesen === undefined) {
      return { tamam: false, hata: "sutun", mesaj: "Süreç bileşeni sütunu bulunamadı; hangisi olduğunu seçin.", baslik: baslik, adaylar: bul.basliklar };
    }
    var haftalar = [], ozel = [];
    for (var i = 0; i < tablo.length; i++) {
      var satir = tablo[i];
      if (i === bul.satir || satir.length <= s.tarih) continue;
      var tarihMetni = satir[s.tarih].metin.replace(/\s+/g, " ").trim();
      if (!tarihMetni) continue;
      var benzersiz = {};
      satir.forEach(function (c) { benzersiz[c.metin] = 1; });
      var cokluHucre = Object.keys(benzersiz).length > 2;
      var r = aralikOku(tarihMetni);
      if (!r) continue;
      if (!cokluHucre) {
        var ad = tarihMetni.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
        var rr = aralikOku((/\(([^)]*)\)/.exec(tarihMetni) || [0, tarihMetni])[1]) || r;
        var t = yilKoy(rr, yil);
        ozel.push({ tur: /tatil/i.test(ad) ? "tatil" : "ozel", ad: ad, baslangic: t.baslangic, bitis: t.bitis });
        continue;
      }
      // veri satırı: tarih hücresi yalnızca tarih olmalı (ör. "09-13 Kasım")
      if (!/^[\d\s.\-–—/a-zA-ZçğıöşüÇĞİÖŞÜâ]+$/.test(tarihMetni) || tarihMetni.length > 40) continue;
      var d = yilKoy(r, yil);
      var metin = (satir[s.bilesen] && satir[s.bilesen].metin) || "";
      var hafta = {
        no: s.hafta !== undefined && satir[s.hafta] ? parseInt(satir[s.hafta].metin, 10) || 0 : 0,
        tarih: tarihMetni, baslangic: d.baslangic, bitis: d.bitis,
        saat: s.saat !== undefined && satir[s.saat] ? satir[s.saat].metin.replace(/\D+/g, " ").trim() : "",
        tema: s.tema !== undefined && satir[s.tema] ? satir[s.tema].metin.replace(/\n/g, " ") : "",
        konu: s.konu !== undefined && satir[s.konu] ? satir[s.konu].metin.replace(/\n/g, " ") : "",
        bilesen: bilesenSatirlari(metin)
      };
      // "*Okul Temelli Planlama", "*Sosyal Etkinlik Haftası": süreç bileşeni yerine etkinlik yazılan haftalar
      hafta.etkinlik = hafta.bilesen.length > 0 && hafta.bilesen.every(function (b) { return /^\*/.test(b); });
      haftalar.push(hafta);
    }
    // doğrulama
    if (!haftalar.length) return { tamam: false, hata: "satir", mesaj: "Tabloda hafta satırı bulunamadı.", baslik: baslik };
    if (!yil) uyari.push("Ders yılı (ör. 2026-2027) planda bulunamadı; tarihler için yıl belirtilmeli.");
    if (haftalar.length < 30) uyari.push("Yalnızca " + haftalar.length + " hafta okundu (genellikle 36–38).");
    haftalar.forEach(function (h, k) {
      if (!h.bilesen.length) uyari.push((h.no || k + 1) + ". hafta (" + h.tarih + "): süreç bileşeni boş.");
      if (h.baslangic && h.bitis && h.baslangic > h.bitis) uyari.push(h.tarih + ": bitiş başlangıçtan önce.");
      if (k > 0 && h.baslangic && haftalar[k - 1].bitis && h.baslangic <= haftalar[k - 1].bitis) uyari.push(h.tarih + ": önceki haftayla çakışıyor ya da sıra bozuk.");
    });
    return { tamam: true, baslik: baslik, yil: yil, sutunlar: s, basliklar: bul.basliklar, haftalar: haftalar, ozel: ozel, uyarilar: uyari };
  }

  /** Bir tarih ('YYYY-MM-DD') hangi haftaya düşer? Hafta sonu önceki haftaya sayılır. Yoksa null. */
  function haftaBul(plan, tarih) {
    var h = plan.haftalar;
    for (var i = 0; i < h.length; i++) {
      if (!h[i].baslangic) continue;
      var son = h[i].bitis, sonraki = h[i + 1] && h[i + 1].baslangic ? h[i + 1].baslangic : "9999-12-31";
      if (tarih >= h[i].baslangic && (tarih <= son || tarih < sonraki && gunFarki(son, tarih) <= 2)) return i;
    }
    return null;
  }
  function gunFarki(a, b) {
    var x = a.split("-"), y = b.split("-");
    return Math.round((Date.UTC(+y[0], y[1] - 1, +y[2]) - Date.UTC(+x[0], x[1] - 1, +x[2])) / 86400000);
  }

  // ───────────── telefonda saklanan planlar: (ders, sınıf seviyesi) anahtarlı ─────────────

  function anahtar(ders, seviye) { return sade(ders) + "|" + seviye; }

  /** Sınıf adından seviye: "9MUH" → 9, "10 GRF" → 10, "11MUH-11TAR" → 11; sayıyla başlamıyorsa 0. */
  function seviyeSinif(sinifAdi) {
    var m = /^\s*(\d{1,2})(?!\d)/.exec(String(sinifAdi || ""));
    var n = m ? parseInt(m[1], 10) : 0;
    return n >= 1 && n <= 12 ? n : 0;
  }

  /** Ayıklama sonucundan saklanacak kayıt. Tarihsiz hafta varsa hata: {hata}. */
  function kayitYap(sonuc, ders, seviye, yil, eklendi) {
    ders = String(ders || "").replace(/\s+/g, " ").trim();
    if (!ders) return { hata: "Ders adı yazılmalı." };
    if (!(seviye >= 1 && seviye <= 12)) return { hata: "Sınıf seviyesi seçilmeli." };
    if (!sonuc || !sonuc.tamam) return { hata: "Plan okunamadı." };
    var eksik = sonuc.haftalar.some(function (h) { return !h.baslangic || !h.bitis; });
    if (eksik) return { hata: "Ders yılı seçilmeli (tarihler tamamlanamadı)." };
    return {
      kayit: {
        anahtar: anahtar(ders, seviye), ders: ders, seviye: seviye, yil: yil || sonuc.yil || null, eklendi: eklendi || "",
        haftalar: sonuc.haftalar.map(function (h) {
          return { no: h.no, tarih: h.tarih, baslangic: h.baslangic, bitis: h.bitis, konu: h.konu, bilesen: h.bilesen, etkinlik: !!h.etkinlik };
        }),
        ozel: sonuc.ozel.map(function (o) { return { tur: o.tur, ad: o.ad, baslangic: o.baslangic, bitis: o.bitis }; })
      }
    };
  }

  /** Aynı (ders, seviye) varsa yerine koyar; yeni dizi döner. */
  function ekle(planlar, kayit) {
    var r = (planlar || []).filter(function (p) { return p.anahtar !== kayit.anahtar; });
    r.push(kayit);
    r.sort(function (a, b) { return a.seviye - b.seviye || (a.anahtar < b.anahtar ? -1 : a.anahtar > b.anahtar ? 1 : 0); });
    return r;
  }
  function kaldir(planlar, anahtarDeger) {
    return (planlar || []).filter(function (p) { return p.anahtar !== anahtarDeger; });
  }
  function bul(planlar, ders, seviye) {
    var a = anahtar(ders, seviye);
    return (planlar || []).filter(function (p) { return p.anahtar === a; })[0] || null;
  }
  /** Saklanan planlar dosyasını okur; bozuksa boş dizi. */
  function listeOku(metin) {
    try {
      var o = JSON.parse(metin || "null");
      var l = Array.isArray(o) ? o : (o && o.planlar);
      return Array.isArray(l) ? l.filter(function (p) { return p && p.anahtar && Array.isArray(p.haftalar); }) : [];
    } catch (e) { return []; }
  }
  function listeYaz(planlar) { return JSON.stringify({ surum: 1, planlar: planlar || [] }); }

  /** Defter verisi dosyası: planlar + sınıf→seviye eşlemesi + sekmenin açık/kapalı durumu (varsayılan açık). */
  function dosyaOku(metin) {
    var r = { planlar: listeOku(metin), sinifSeviye: {}, sekmeAcik: true };
    try {
      var o = JSON.parse(metin || "null");
      if (o && !Array.isArray(o)) {
        if (o.sinifSeviye && typeof o.sinifSeviye === "object") {
          Object.keys(o.sinifSeviye).forEach(function (k) {
            var n = o.sinifSeviye[k];
            if (typeof n === "number" && n >= 1 && n <= 12) r.sinifSeviye[k] = n;
          });
        }
        if (o.sekmeAcik === false) r.sekmeAcik = false;
      }
    } catch (e) { /* varsayılanlar */ }
    return r;
  }
  function dosyaYaz(planlar, sinifSeviye, sekmeAcik) {
    return JSON.stringify({ surum: 2, planlar: planlar || [], sinifSeviye: sinifSeviye || {}, sekmeAcik: sekmeAcik !== false });
  }

  /**
   * Defter kartı: şimdi süren ders, yoksa sıradaki ders (bugün ya da sonraki ders günü; tatil/ders yok/son dersten sonra dahil).
   * Karar mantığı Durum.durum() ile aynıdır (yeni zamanlayıcı yok).
   * Dönüş: { tur: "yok" | "dersYok" | "seviyeYok" | "planYok" | "ok", ... }
   *   ok: { hedef:{tur:"surer"|"arada"|"sonraki", tarih, fark, gun, blok}, sinif, ders, seviye, plan, idx, tarihPlanda, anahtar }
   */
  function kart(program, planlar, sinifSeviye, simdi, tatil, Durum) {
    var d = Durum.durum(program, simdi, tatil), hedef;
    if (d.tur === "surer") hedef = { tur: "surer", tarih: Durum.isoTarih(simdi), fark: 0, gun: d.gun, blok: d.blok };
    else if (d.tur === "arada") hedef = { tur: "arada", tarih: Durum.isoTarih(simdi), fark: 0, gun: d.gun, blok: d.sonraki };
    else if (d.sonrakiGun) hedef = { tur: "sonraki", tarih: d.sonrakiGun.tarih, fark: d.sonrakiGun.fark, gun: d.sonrakiGun.gun, blok: d.sonrakiGun.blok };
    else return { tur: "yok" };
    var blok = hedef.blok, sinif = blok.sinif;
    var ders = Durum.tamAd(program, blok.ders) || "";
    var r = { hedef: hedef, sinif: sinif, ders: ders };
    if (!ders || sade(ders) === sade(sinif)) { r.tur = "dersYok"; return r; }
    var seviye = (sinifSeviye && sinifSeviye[sinif]) || seviyeSinif(sinif);
    r.seviye = seviye;
    if (!seviye) { r.tur = "seviyeYok"; return r; }
    var plan = bul(planlar, ders, seviye);
    if (!plan || !plan.haftalar.length) { r.tur = "planYok"; return r; }
    var idx = haftaBul(plan, hedef.tarih);
    r.tarihPlanda = idx !== null;
    if (idx === null) { // tarih planda yok (tatil boşluğu, plan dışı): en yakın sonraki hafta, yoksa sonuncu
      idx = plan.haftalar.length - 1;
      for (var i = 0; i < plan.haftalar.length; i++) { if (plan.haftalar[i].baslangic >= hedef.tarih) { idx = i; break; } }
    }
    r.tur = "ok"; r.plan = plan; r.idx = idx;
    r.anahtar = [sinif, ders, seviye, hedef.tarih, blok.slot].join("|");
    return r;
  }

  /** Onay ekranı özeti. */
  function ozetle(sonuc) {
    var h = sonuc.haftalar;
    return { hafta: h.length, tatil: sonuc.ozel.filter(function (o) { return o.tur === "tatil"; }).length,
      etkinlik: h.filter(function (x) { return x.etkinlik; }).length, ilk: h[0] ? h[0].tarih : "", son: h.length ? h[h.length - 1].tarih : "" };
  }

  /** Dosya baytlarından doğrudan sonuç (tarayıcıda ve Node'da). */
  async function dosyadan(bayt, secenek) {
    return ayikla(await belgeXml(bayt), secenek);
  }

  var cikti = { zipListe: zipListe, zipDosya: zipDosya, inflateRaw: inflateRaw, belgeXml: belgeXml, satirlar: satirlar, aralikOku: aralikOku,
    bilesenSatirlari: bilesenSatirlari, baslikOku: baslikOku, ayikla: ayikla, haftaBul: haftaBul, dosyadan: dosyadan, sade: sade, anahtar: anahtar, seviyeSinif: seviyeSinif,
    kayitYap: kayitYap, dosyaOku: dosyaOku, dosyaYaz: dosyaYaz, kart: kart, ekle: ekle, kaldir: kaldir, bul: bul, listeOku: listeOku, listeYaz: listeYaz, ozetle: ozetle };
  genel.Plan = cikti;
  if (typeof module !== "undefined" && module.exports) module.exports = cikti;
})(typeof window !== "undefined" ? window : globalThis);
