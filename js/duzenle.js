/* Elle program kurma ve hücre düzenleme: saf işlevler (arayüzden bağımsız, Node'da test edilir: testler/test_duzenle.mjs).
 * Program, PDF ayıklayıcının ürettiği yapıyla AYNIDIR (zil, ders_saatleri, ozel, bloklar); widget'lar ve karar mantığı
 * değişmeden çalışır. Elle girilen/düzenlenen programda kaynak = "elle" ya da duzenlendi = true olur.
 */
(function (genel) {
  "use strict";

  var SINIR = { baslik: 7, ders: 14 };      // hücrede görünen başlık / ders adı en çok karakter
  var TURLER = ["ders", "idari", "hazirlik", "nobet", "diger", "bos"];
  var TEN_DK = 15;                          // bundan uzun boşluk (öğle arası) varsa iki saat tek blok olmaz

  function iki(n) { return (n < 10 ? "0" : "") + n; }
  function dk(s) { var p = s.split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function saat(d) { return iki(Math.floor(d / 60)) + ":" + iki(d % 60); }
  function kopya(x) { return JSON.parse(JSON.stringify(x)); }
  function buyuk(s) { return String(s).trim().toLocaleUpperCase("tr-TR"); }

  /** İlk ders başlangıcından n saatlik zil üretir. ogleSonra: bu dersten sonra öğle arası (0 = yok). */
  function zilUret(ilk, dersDk, teneffusDk, n, ogleSonra, ogleDk) {
    var t = dk(ilk), r = [];
    for (var i = 1; i <= n; i++) {
      r.push([saat(t), saat(t + dersDk)]);
      t += dersDk + (i === ogleSonra ? ogleDk : teneffusDk);
    }
    return r;
  }

  /** Bir zil listesinin hataları (boş dizi = temiz). */
  function zilHatalari(liste) {
    var h = [];
    for (var i = 0; i < liste.length; i++) {
      if (!/^\d{1,2}:\d{2}$/.test(liste[i][0]) || !/^\d{1,2}:\d{2}$/.test(liste[i][1])) { h.push((i + 1) + ". ders: saat girilmemiş."); continue; }
      if (dk(liste[i][1]) <= dk(liste[i][0])) h.push((i + 1) + ". ders: bitiş saati başlangıçtan sonra olmalı.");
      if (i > 0 && /^\d/.test(liste[i - 1][1]) && dk(liste[i][0]) < dk(liste[i - 1][1])) h.push((i + 1) + ". ders önceki dersle çakışıyor.");
    }
    return h;
  }

  /** zil: {gun: [[bas,bit],…]} → program.zil biçimine ({gun:{slot:[bas,bit]}}). */
  function zilBicimi(gunZil) {
    var z = {};
    Object.keys(gunZil).map(Number).sort(function (a, b) { return a - b; }).forEach(function (g) {
      z[g] = {};
      gunZil[g].forEach(function (s, i) { z[g][i + 1] = [s[0], s[1]]; });
    });
    return z;
  }

  /** Bloklar: ardışık, aynı sınıf+ders saatleri (öğle arası bölmez). Karar mantığı artık ders_saatleri'ni kullanır; bloklar uyumluluk içindir. */
  function bloklariYenile(p) {
    var sirali = p.ders_saatleri.slice().sort(function (a, b) { return a.gun * 100 + a.slot - (b.gun * 100 + b.slot); });
    var bl = [];
    sirali.forEach(function (h) {
      var son = bl[bl.length - 1];
      if (son && son.gun === h.gun && son.sinif === h.sinif && son.ders_kisa === h.ders_kisa && dk(h.baslangic) - dk(son.bitis) <= TEN_DK) {
        son.bitis = h.bitis; son.saatler.push(h.slot);
      } else {
        bl.push({ gun: h.gun, baslangic: h.baslangic, bitis: h.bitis, sinif: h.sinif, ders: h.ders, ders_kisa: h.ders_kisa, saatler: [h.slot] });
      }
    });
    p.bloklar = bl;
    p.ders_saatleri = sirali;
    p.ozel = p.ozel.slice().sort(function (a, b) { return a.gun * 100 + a.slot - (b.gun * 100 + b.slot); });
    return p;
  }

  /** Boş program (tüm hücreler boş). */
  function bosProgram(zilGunleri, ust) {
    ust = ust || {};
    var p = {
      kaynak: "elle", ogretmen: ust.ogretmen || null, okul: ust.okul || null, gecerli_baslangic: ust.baslangic || null,
      zil: zilBicimi(zilGunleri), bloklar: [], ozel: [], ders_saatleri: [], uyarilar: [], duzenlendi: true
    };
    return p;
  }

  function hucreyiTemizle(p, gun, slot) {
    p.ders_saatleri = p.ders_saatleri.filter(function (h) { return !(h.gun === gun && h.slot === slot); });
    p.ozel = p.ozel.filter(function (o) { return !(o.gun === gun && o.slot === slot); });
  }

  /** a = {tur, sinif, ders, ad}. Yeni program döndürür (girdi değişmez). Geçersizse {hata}. */
  function hucreAyarla(program, gun, slot, a) {
    var p = kopya(program);
    var z = p.zil[gun] && p.zil[gun][slot];
    if (!z) return { hata: "Bu saat için ders saati tanımlı değil." };
    if (TURLER.indexOf(a.tur) < 0) return { hata: "Bilinmeyen tür." };
    hucreyiTemizle(p, gun, slot);
    if (a.tur === "ders") {
      var sinif = buyuk(a.sinif || ""), ders = buyuk(a.ders || "");
      if (!sinif) return { hata: "Sınıf / başlık boş olamaz." };
      if (sinif.length > SINIR.baslik) return { hata: "Başlık en çok " + SINIR.baslik + " karakter olabilir." };
      if (ders.length > SINIR.ders) return { hata: "Ders adı en çok " + SINIR.ders + " karakter olabilir." };
      p.ders_saatleri.push({ gun: gun, slot: slot, baslangic: z[0], bitis: z[1], sinif: sinif, ders_kisa: ders || sinif, ders: ders || sinif, maasli: false, isaret: "" });
    } else if (a.tur === "diger") {
      var ad = String(a.ad || "").trim();
      if (!ad) return { hata: "Yazı boş olamaz." };
      if (ad.length > SINIR.baslik) return { hata: "Yazı en çok " + SINIR.baslik + " karakter olabilir." };
      p.ozel.push({ gun: gun, slot: slot, baslangic: z[0], bitis: z[1], tur: "diger", ad: ad });
    } else if (a.tur !== "bos") {
      p.ozel.push({ gun: gun, slot: slot, baslangic: z[0], bitis: z[1], tur: a.tur });
    }
    p.duzenlendi = true;
    return bloklariYenile(p);
  }

  /** Sınıf/başlık adını programın her yerinde değiştirir. */
  function sinifAdiDegistir(program, eski, yeni) {
    var p = kopya(program);
    yeni = buyuk(yeni);
    if (!yeni) return { hata: "Başlık boş olamaz." };
    if (yeni.length > SINIR.baslik) return { hata: "Başlık en çok " + SINIR.baslik + " karakter olabilir." };
    p.ders_saatleri.forEach(function (h) { if (h.sinif === eski) h.sinif = yeni; });
    p.duzenlendi = true;
    return bloklariYenile(p);
  }

  /**
   * Zil değişince hücreleri korur: yeni zilde bulunan (gün, saat) hücreleri kalır, saatleri güncellenir; kalmayanlar silinir.
   * @returns {{program, silinen}} silinen = kaybolan dolu hücre sayısı
   */
  function zilYenidenKur(program, yeniGunZil) {
    var p = kopya(program), yeni = zilBicimi(yeniGunZil), silinen = 0;
    function var_(x) { return yeni[x.gun] && yeni[x.gun][x.slot]; }
    p.ders_saatleri = p.ders_saatleri.filter(function (h) { if (var_(h)) return true; silinen++; return false; });
    p.ozel = p.ozel.filter(function (o) { if (var_(o)) return true; silinen++; return false; });
    p.ders_saatleri.forEach(function (h) { h.baslangic = yeni[h.gun][h.slot][0]; h.bitis = yeni[h.gun][h.slot][1]; });
    p.ozel.forEach(function (o) { o.baslangic = yeni[o.gun][o.slot][0]; o.bitis = yeni[o.gun][o.slot][1]; });
    p.zil = yeni;
    p.duzenlendi = true;
    return { program: bloklariYenile(p), silinen: silinen };
  }

  /** Programın zilini düzenleyicinin kullandığı biçime çevirir: {gun: [[bas,bit],…]}. */
  function gunZilleri(p) {
    var r = {};
    Object.keys(p.zil).forEach(function (g) {
      var slotlar = Object.keys(p.zil[g]).map(Number).sort(function (a, b) { return a - b; });
      r[g] = slotlar.map(function (s) { return p.zil[g][s]; });
    });
    return r;
  }

  var YEDEK_TUR = "haftalik-ders-programi-yedek";

  function yedekYap(program, tatil, widgetAyar, planlar, sinifSeviye) {
    return JSON.stringify({ tur: YEDEK_TUR, surum: 2, program: program, tatil: tatil || [], widgetAyar: widgetAyar || {}, planlar: planlar || [], sinifSeviye: sinifSeviye || {} });
  }

  /** @returns {{program, tatil, widgetAyar, planlar}|{hata}} */
  function yedekOku(metin) {
    var y;
    try { y = JSON.parse(metin); } catch (e) { return { hata: "Dosya bir yedek dosyası değil." }; }
    if (!y || y.tur !== YEDEK_TUR || !y.program || !y.program.zil || !y.program.ders_saatleri || !y.program.ozel) return { hata: "Bu dosya Haftalık Ders Programı yedeği değil." };
    // planlar: sürüm 1 yedeklerinde yok (null = telefondaki planlara dokunma)
    return { program: y.program, tatil: Array.isArray(y.tatil) ? y.tatil : [], widgetAyar: y.widgetAyar || {}, planlar: Array.isArray(y.planlar) ? y.planlar : null,
      sinifSeviye: y.sinifSeviye && typeof y.sinifSeviye === "object" ? y.sinifSeviye : null };
  }

  var cikti = { SINIR: SINIR, zilUret: zilUret, zilHatalari: zilHatalari, bosProgram: bosProgram, hucreAyarla: hucreAyarla,
    sinifAdiDegistir: sinifAdiDegistir, zilYenidenKur: zilYenidenKur, gunZilleri: gunZilleri, bloklariYenile: bloklariYenile,
    yedekYap: yedekYap, yedekOku: yedekOku };
  genel.Duzenle = cikti;
  if (typeof module !== "undefined" && module.exports) module.exports = cikti;
})(typeof window !== "undefined" ? window : globalThis);
