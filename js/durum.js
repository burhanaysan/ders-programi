/* Ders programına ve ana göre "şimdi ne var" kararı + widget/kart metinleri + Türkçe yazı yardımcıları.
 * Saf işlevler: tarayıcıdan bağımsızdır, Node'da test edilir (testler/test_durum.mjs).
 * Widget'ın Java'daki karar mantığı (DurumHesabi.java) bununla AYNI sonuçları vermelidir:
 * testler/uret_java_fixture.mjs bu dosyadan altın veri üretir, testler/java/DurumTest.java Java'yı onunla karşılaştırır.
 *
 * tatil: [{bas:"2026-11-16", bit:"2026-11-20", ad:"1. Ara Tatil"}] (ISO tarihler, ikisi de dahil).
 */
(function (genel) {
  "use strict";

  var GUN_ADLARI = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  var GUN_KISA = ["", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  var AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var ARAMA_GUNU = 500; // sonraki dersli günü en çok bu kadar gün ileride ara

  function dk(s) { var p = s.split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function iki(n) { return (n < 10 ? "0" : "") + n; }
  function isoTarih(d) { return d.getFullYear() + "-" + iki(d.getMonth() + 1) + "-" + iki(d.getDate()); }

  /** JS Date → program günü (Pazartesi=1 … Pazar=7). */
  function programGunu(tarih) { var g = tarih.getDay(); return g === 0 ? 7 : g; }

  /** Günün ders SAATLERİ (ardışık saatler ayrı kayıt), başlangıca göre sıralı. */
  function gununSaatleri(program, gun) {
    return program.ders_saatleri.filter(function (b) { return b.gun === gun; })
      .sort(function (a, b) { return dk(a.baslangic) - dk(b.baslangic); });
  }

  function idariMi(program, gun) {
    return program.ozel.some(function (o) { return o.gun === gun && o.tur === "idari"; });
  }

  function tatilBul(tatil, iso) {
    if (!tatil) return null;
    for (var i = 0; i < tatil.length; i++) {
      if (tatil[i].bas <= iso && iso <= tatil[i].bit) return tatil[i];
    }
    return null;
  }

  /** simdi'den sonraki ilk dersli, tatil olmayan günü bulur; yoksa null. */
  function sonrakiDersGunu(program, simdi, tatil) {
    for (var fark = 1; fark <= ARAMA_GUNU; fark++) {
      var d = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() + fark);
      if (tatilBul(tatil, isoTarih(d))) continue;
      var b = gununSaatleri(program, programGunu(d));
      if (b.length) return { gun: programGunu(d), fark: fark, tarih: isoTarih(d), blok: b[0] };
    }
    return null;
  }

  /**
   * @returns {{tur:"surer",...}|{tur:"arada",...}|{tur:"bitti",...}|{tur:"dersYok",...}|{tur:"tatil",...}}
   */
  function durum(program, simdi, tatil) {
    var gun = programGunu(simdi);
    var dakika = simdi.getHours() * 60 + simdi.getMinutes();
    var th = tatilBul(tatil, isoTarih(simdi));
    if (th) return { tur: "tatil", gun: gun, ad: th.ad, sonrakiGun: sonrakiDersGunu(program, simdi, tatil) };
    var bloklar = gununSaatleri(program, gun);
    if (!bloklar.length) {
      return { tur: "dersYok", gun: gun, idari: idariMi(program, gun), sonrakiGun: sonrakiDersGunu(program, simdi, tatil) };
    }
    for (var i = 0; i < bloklar.length; i++) {
      var b = bloklar[i];
      if (dakika >= dk(b.baslangic) && dakika < dk(b.bitis)) {
        return { tur: "surer", gun: gun, blok: b, sonraki: bloklar[i + 1] || null };
      }
      if (dakika < dk(b.baslangic)) return { tur: "arada", gun: gun, sonraki: b };
    }
    return { tur: "bitti", gun: gun, sonrakiGun: sonrakiDersGunu(program, simdi, tatil) };
  }

  // ── Türkçe: saatten sonra gelen -de/-da/-te/-ta eki (son söylenen sayıya göre) ──
  var BIRLER = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
  var ONLAR = ["", "on", "yirmi", "otuz", "kırk", "elli"];
  var EK = { "sıfır": "da", "bir": "de", "iki": "de", "üç": "te", "dört": "te", "beş": "te", "altı": "da",
    "yedi": "de", "sekiz": "de", "dokuz": "da", "on": "da", "yirmi": "de", "otuz": "da", "kırk": "ta", "elli": "de" };

  function sonSozcuk(n) {
    if (n === 0) return "sıfır";
    if (n % 10 === 0) return ONLAR[n / 10];
    return BIRLER[n % 10];
  }

  /** "13:15" → "13:15'te". Dakika 00 ise saat okunur ("11:00" → "on bir" → 'de'). */
  function saatEki(saat) {
    var p = saat.split(":"), s = parseInt(p[0], 10), d = parseInt(p[1], 10);
    return saat + "'" + EK[sonSozcuk(d === 0 ? s : d)];
  }

  /** "BİYOLOJİ" → "Biyoloji" (tr-TR). */
  /** Kısaltılmış ders adı ("BİYO.") programdaki başka bir dersin tam adının başı ise tam adı ("BİYOLOJİ") döndürür. */
  function tamAd(program, ders) {
    if (!ders || ders.slice(-1) !== ".") return ders;
    var kok = ders.replace(/\.+$/, "").toLocaleUpperCase("tr-TR"), en = ders;
    program.ders_saatleri.forEach(function (h) {
      var a = h.ders || "";
      if (a.length > en.length && a.slice(-1) !== "." && a.toLocaleUpperCase("tr-TR").indexOf(kok) === 0) en = a;
    });
    return en;
  }

  function baslikHarfi(m) {
    var k = m.toLocaleLowerCase("tr-TR");
    return k.charAt(0).toLocaleUpperCase("tr-TR") + k.slice(1);
  }

  /** "Yarın 08:30 · 9AD." / "Sıradaki: Pazartesi 11:50 · 10 GRF" / uzun aralıkta tarihli. */
  function sonrakiEtiket(sg) {
    if (!sg) return "";
    var gunYazi;
    if (sg.fark === 1) gunYazi = "Yarın";
    else {
      gunYazi = GUN_ADLARI[sg.gun];
      if (sg.fark > 6) gunYazi += " " + parseInt(sg.tarih.slice(8, 10), 10) + " " + AYLAR[parseInt(sg.tarih.slice(5, 7), 10) - 1];
    }
    return (sg.fark === 1 ? "" : "Sıradaki: ") + gunYazi + " " + sg.blok.baslangic + " · " + sg.blok.sinif;
  }

  /** Widget ve uygulama kartının ortak metni. */
  function metin(program, simdi, tatil) {
    var d = durum(program, simdi, tatil);
    var r = { tur: d.tur, gun: d.gun, band: "", l1: "", big: "", l2: "", l3: "", sinif: "", ders: "", slot: 0 };
    if (d.tur === "surer") {
      r.slot = d.blok.slot;
      r.band = "ŞİMDİ · " + d.blok.slot + ". DERS";
      r.big = d.blok.sinif; r.sinif = d.blok.sinif;
      r.l1 = baslikHarfi(tamAd(program, d.blok.ders));
      r.l2 = d.blok.baslangic + " – " + d.blok.bitis;
      r.l3 = d.sonraki ? "Sonra: " + d.sonraki.sinif + " · " + d.sonraki.baslangic : "";
    } else if (d.tur === "arada") {
      r.band = "SIRADAKİ";
      r.l1 = "Dersiniz saat";
      r.big = saatEki(d.sonraki.baslangic); r.sinif = d.sonraki.sinif; r.ders = baslikHarfi(tamAd(program, d.sonraki.ders));
      r.l2 = "başlayacak · " + d.sonraki.sinif;
    } else if (d.tur === "bitti") {
      r.big = "Bugünkü dersleriniz bitti";
      r.l2 = sonrakiEtiket(d.sonrakiGun);
    } else if (d.tur === "tatil") {
      r.big = "Bugün tatil";
      r.l1 = d.ad;
      r.l2 = sonrakiEtiket(d.sonrakiGun);
    } else {
      r.big = "Bugün dersiniz yok";
      r.l1 = d.idari ? "İdari görev günü" : "";
      r.l2 = sonrakiEtiket(d.sonrakiGun);
    }
    return r;
  }

  var cikti = {
    GUN_ADLARI: GUN_ADLARI, GUN_KISA: GUN_KISA, AYLAR: AYLAR, programGunu: programGunu, gununSaatleri: gununSaatleri,
    idariMi: idariMi, tatilBul: tatilBul, sonrakiDersGunu: sonrakiDersGunu, durum: durum, saatEki: saatEki,
    baslikHarfi: baslikHarfi, tamAd: tamAd, sonrakiEtiket: sonrakiEtiket, metin: metin, isoTarih: isoTarih
  };
  genel.Durum = cikti;
  if (typeof module !== "undefined" && module.exports) module.exports = cikti;
})(typeof window !== "undefined" ? window : globalThis);
