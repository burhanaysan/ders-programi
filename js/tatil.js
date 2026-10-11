/* Varsayılan tatil günleri: resmî tatiller, dini bayramlar (Diyanet listesi, HızlıNot ile aynı kaynak) ve
 * 2026-2027 yıllık planlardaki ara tatiller. Kullanıcı Ayarlar'dan ekleyip silebilir; liste tatil.json'a yazılır
 * (widget aynı dosyayı okur). Arife günleri tatil sayılmaz (yarım gün).
 */
(function (genel) {
  "use strict";

  var RESMI = [["01-01", "Yılbaşı"], ["04-23", "Ulusal Egemenlik ve Çocuk Bayramı"], ["05-01", "Emek ve Dayanışma Günü"],
    ["05-19", "Atatürk'ü Anma, Gençlik ve Spor Bayramı"], ["07-15", "Demokrasi ve Millî Birlik Günü"],
    ["08-30", "Zafer Bayramı"], ["10-29", "Cumhuriyet Bayramı"]];
  var RAMAZAN = ["2025-03-30", "2026-03-20", "2027-03-09", "2028-02-26", "2029-02-14", "2030-02-04"];
  var KURBAN = ["2025-06-06", "2026-05-27", "2027-05-16", "2028-05-05", "2029-04-24", "2030-04-13"];
  // 2026-2027 öğretim yılı planlarındaki ara tatiller (9., 10., 11. sınıf yıllık planları aynı)
  var ARA_TATIL = [["2026-11-16", "2026-11-20", "1. Ara Tatil"], ["2027-01-25", "2027-02-05", "Yarıyıl Tatili"],
    ["2027-03-08", "2027-03-12", "2. Ara Tatil"]];

  function iki(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + iki(d.getMonth() + 1) + "-" + iki(d.getDate()); }
  function ekle(iso0, gun) {
    var d = new Date(+iso0.slice(0, 4), +iso0.slice(5, 7) - 1, +iso0.slice(8, 10) + gun);
    return iso(d);
  }

  /** Programın geçerlilik başlangıcından itibaren 12 ay için varsayılan tatiller (tarih sırasıyla). */
  function varsayilan(baslangicIso) {
    var bas = baslangicIso || iso(new Date());
    var bit = ekle(bas, 366);
    var liste = [];
    var yil = +bas.slice(0, 4);
    for (var y = yil; y <= yil + 1; y++) {
      RESMI.forEach(function (r) { liste.push({ bas: y + "-" + r[0], bit: y + "-" + r[0], ad: r[1] }); });
    }
    [[RAMAZAN, 3, "Ramazan Bayramı"], [KURBAN, 4, "Kurban Bayramı"]].forEach(function (b) {
      b[0].forEach(function (ilk) { liste.push({ bas: ilk, bit: ekle(ilk, b[1] - 1), ad: b[2] }); });
    });
    ARA_TATIL.forEach(function (a) { liste.push({ bas: a[0], bit: a[1], ad: a[2] }); });
    return liste.filter(function (t) { return t.bit >= bas && t.bas <= bit; })
      .sort(function (a, b) { return a.bas < b.bas ? -1 : a.bas > b.bas ? 1 : 0; });
  }

  genel.Tatil = { varsayilan: varsayilan };
  if (typeof module !== "undefined" && module.exports) module.exports = genel.Tatil;
})(typeof window !== "undefined" ? window : globalThis);
