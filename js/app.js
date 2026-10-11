/* Haftalık Ders Programı — arayüz. Ekranlar: Hafta, Bugün (gün listesi), Program (PDF yükle), Defter (yıllık planlar), Ayarlar;
   program yokken Kurulum; PDF okunduktan sonra Onay. Animasyon yoktur. */
(function () {
  "use strict";

  var D = window.Durum;
  var Z = window.Duzenle;
  var AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var SEKMELER = [["hafta", "Hafta"], ["gun", "Bugün"], ["program", "Program"], ["defter", "Defter"], ["ayarlar", "Ayarlar"]];
  var P = window.Plan;
  function sekmeListesi() { return SEKMELER.filter(function (t) { return t[0] !== "defter" || durumu.defterAcik; }); }

  // Android'de Java köprüsü; tarayıcıda önizleme için yerel yedek
  var kopru = window.DersKopru || {
    pdfSec: function () {
      var i = document.createElement("input");
      i.type = "file"; i.accept = "application/pdf";
      i.onchange = function () { if (i.files[0]) i.files[0].arrayBuffer().then(function (b) { pdfIsle(b); }); };
      i.click();
    },
    programOku: function () { return localStorage.getItem("program") || ""; },
    programKaydet: function (j) { localStorage.setItem("program", j); return true; },
    programSil: function () { localStorage.removeItem("program"); return true; },
    tatilOku: function () { return localStorage.getItem("tatil") || ""; },
    tatilYaz: function (j) { localStorage.setItem("tatil", j); return true; },
    widgetAyarOku: function () { return localStorage.getItem("widgetAyar") || ""; },
    widgetAyarYaz: function (j) { localStorage.setItem("widgetAyar", j); return true; },
    widgetEkle: function (tur) { return false; },
    planSec: function () {
      var i = document.createElement("input");
      i.type = "file"; i.accept = ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      i.onchange = function () { if (i.files[0]) i.files[0].arrayBuffer().then(function (b) { planIsle(b); }); };
      i.click();
    },
    planOku: function () { return localStorage.getItem("planlar") || ""; },
    planYaz: function (j) { localStorage.setItem("planlar", j); return true; },
    yedekKaydet: function (metin) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([metin], { type: "application/json" }));
      a.download = "haftalik-ders-programi-yedek.json"; a.click();
      setTimeout(function () { window.uygulama.yedekSonuc({ ok: true }); }, 0);
      return true;
    },
    yedekAc: function () {
      var i = document.createElement("input");
      i.type = "file"; i.accept = ".json,application/json";
      i.onchange = function () { if (i.files[0]) i.files[0].text().then(yedekIsle); };
      i.click();
    }
  };

  var durumu = { tatil: [], ayar: { opaklik: 100, boyut: "buyuk", tema: "krem", yazi: "otomatik" }, program: null, sekme: "hafta", gun: D.programGunu(new Date()), onay: null, hata: null, bekle: false, surum: null, kur: null, modal: null, mesaj: "", planlar: [], planEkle: null, planMesaj: "", sinifSeviye: {}, defterAcik: true, defterOfs: 0, defterAnahtar: "", planGor: null };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function dk(s) { var p = s.split(":"); return +p[0] * 60 + +p[1]; }
  function tarihYaz(iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : ""; }
  function sinifSinifi(sinif) {
    var m = /^(\d{1,2})/.exec(sinif);
    var d = m ? parseInt(m[1], 10) : 0;
    return d >= 9 && d <= 12 ? "s" + d : "s11";
  }
  function buyuk(s) { return s.toLocaleUpperCase("tr-TR"); }

  // ───────────── program yükleme / okuma ─────────────

  function programYukle() {
    var j = kopru.programOku();
    if (!j) return null;
    try { var p = JSON.parse(j); return p && p.ders_saatleri && p.zil && p.ozel ? p : null; } catch (e) { return null; }
  }

  function pdfIsle(tampon) {
    durumu.bekle = true; durumu.hata = null; ciz();
    window.PdfOku.parcalar(tampon).then(function (parcalar) {
      var p = window.Ayikla.ayikla(parcalar);
      durumu.onay = p; durumu.bekle = false; ciz();
    }).catch(function (e) {
      durumu.onay = null; durumu.bekle = false;
      durumu.hata = (e && e.message) ? e.message : String(e);
      ciz();
    });
  }

  // ───────────── yıllık plan (Defter sekmesi): ekleme akışı ─────────────

  function planIsle(tampon) {
    durumu.planEkle = { adim: "bekle" }; ciz();
    P.belgeXml(new Uint8Array(tampon)).then(function (xml) {
      planDegerlendir(xml, {});
    }).catch(function (e) {
      durumu.planEkle = { adim: "hata", ileti: (e && e.message) ? e.message : String(e) }; ciz();
    });
  }

  /** XML'i verilen seçeneklerle (kullanıcının seçtiği sütun/yıl) yeniden ayıklar ve uygun ekrana geçer. */
  function planDegerlendir(xml, secenek) {
    var eski = durumu.planEkle || {};
    var r = P.ayikla(xml, secenek);
    if (!r.tamam) {
      durumu.planEkle = r.hata === "sutun" ? { adim: "sutun", xml: xml, secenek: secenek, adaylar: r.adaylar } : { adim: "hata", ileti: r.mesaj };
    } else {
      var ders = eski.ders !== undefined ? eski.ders : programDersiAdi(r.baslik.ders);
      var seviye = eski.seviye !== undefined ? eski.seviye : (r.baslik.seviye >= 1 && r.baslik.seviye <= 12 ? r.baslik.seviye : 0);
      durumu.planEkle = { adim: "onizle", xml: xml, secenek: secenek, sonuc: r, ders: ders, seviye: seviye, yil: r.yil, hata: "" };
    }
    ciz();
  }

  /** Planın başlığındaki ders adı programdaki bir dersle aynıysa programdaki yazımı kullanılır. */
  function programDersiAdi(ad) {
    if (!ad) return "";
    var bulunan = programDersleri().filter(function (d) { return P.sade(d) === P.sade(ad); })[0];
    return bulunan || D.baslikHarfi(ad);
  }
  function programDersleri() {
    var p = durumu.program, g = {}, l = [];
    if (p) p.ders_saatleri.forEach(function (x) {
      var ad = D.baslikHarfi(D.tamAd(p, x.ders));
      if (ad && !g[P.sade(ad)]) { g[P.sade(ad)] = 1; l.push(ad); }
    });
    return l;
  }
  function okulYillari() {
    var an = new Date(), y = an.getMonth() >= 7 ? an.getFullYear() : an.getFullYear() - 1;
    return [[y, y + 1], [y + 1, y + 2]];
  }

  function planEkrani(pe) {
    var h = "";
    if (pe.adim === "sutun") {
      h = '<div class="kutu uyari"><h2>Sütunu seçin</h2><p>Planda “süreç bileşeni” sütunu kendiliğinden bulunamadı. Deftere yazdığınız metnin bulunduğu sütunun başlığına dokunun.</p></div>';
      pe.adaylar.forEach(function (a, i) {
        if (a && a.trim()) h += '<button class="dugme ikincil" data-act="planSutun" data-i="' + i + '">' + esc(a) + "</button>";
      });
      return h + '<button class="dugme ikincil" data-act="planVazgec">Vazgeç</button>';
    }
    var r = pe.sonuc, o = P.ozetle(r), varOlan = pe.ders && pe.seviye ? P.bul(durumu.planlar, pe.ders, pe.seviye) : null;
    h += '<div class="kutu"><div class="s"><span>Okunan hafta</span><span>' + o.hafta + "</span></div>" +
      '<div class="s"><span>İlk hafta</span><span>' + esc(o.ilk) + "</span></div>" +
      '<div class="s"><span>Son hafta</span><span>' + esc(o.son) + "</span></div>" +
      (o.tatil ? '<div class="s"><span>Tatil satırı</span><span>' + o.tatil + "</span></div>" : "") +
      (o.etkinlik ? '<div class="s"><span>Etkinlik haftası</span><span>' + o.etkinlik + "</span></div>" : "") + "</div>";
    if (r.uyarilar.length) h += '<div class="kutu uyari"><h2>Dikkat</h2><ul>' + r.uyarilar.map(function (u) { return "<li>" + esc(u) + "</li>"; }).join("") + "</ul></div>";
    // ders + seviye (+ yıl bulunamadıysa yıl)
    var dersler = programDersleri();
    h += '<div class="kutu"><h2>Bu plan hangi ders ve sınıf için?</h2>' +
      '<label class="alan"><span>Ders</span><input type="text" data-pl="ders" maxlength="40" value="' + esc(pe.ders) + '"></label>';
    if (dersler.length) {
      h += '<div class="seg segsar">' + dersler.map(function (d) {
        return '<button data-act="planDers" data-v="' + esc(d) + '"' + (P.sade(d) === P.sade(pe.ders) ? ' class="a"' : "") + ">" + esc(d) + "</button>";
      }).join("") + "</div>";
    }
    h += '<div class="ayar"><div class="et"><span>Sınıf seviyesi</span></div><div class="seg segsar">' +
      [5, 6, 7, 8, 9, 10, 11, 12].map(function (n) { return '<button data-act="planSeviye" data-v="' + n + '"' + (pe.seviye === n ? ' class="a"' : "") + ">" + n + "</button>"; }).join("") + "</div></div>";
    if (!r.yil) {
      h += '<div class="ayar"><div class="et"><span>Ders yılı (planda bulunamadı)</span></div><div class="seg">' + okulYillari().map(function (y) {
        return '<button data-act="planYil" data-v="' + y[0] + "-" + y[1] + '"' + (pe.yil && pe.yil[0] === y[0] ? ' class="a"' : "") + ">" + y[0] + "–" + y[1] + "</button>";
      }).join("") + "</div></div>";
    }
    h += "</div>";
    if (varOlan) h += '<div class="kutu uyari"><p>Bu ders ve sınıf için kayıtlı plan var (' + varOlan.haftalar.length + " hafta). Kaydederseniz yenisiyle değişir.</p></div>";
    if (pe.hata) h += '<div class="kutu hata"><p>' + esc(pe.hata) + "</p></div>";
    h += '<button class="dugme" data-act="planKaydet">Planı kaydet</button><button class="dugme ikincil" data-act="planVazgec">Vazgeç</button>';
    h += '<div class="kutu"><h2>Okunan hafta metinleri</h2><p class="not">Deftere yazdığınız metinle karşılaştırın.</p>' + r.haftalar.map(function (w) {
      return '<div class="hf' + (w.etkinlik ? " e" : "") + '"><div class="b">' + (w.no ? w.no + ". hafta · " : "") + esc(w.tarih) + '</div><div class="m">' + esc(w.bilesen.join("\n")) + "</div></div>";
    }).join("") + "</div>";
    return h;
  }

  /** Defter verisinin (planlar + sınıf seviyeleri + sekme ayarı) tek yazım yolu; başarısızsa bellekteki liste değişmez. */
  function planlariKaydet(yeni) {
    var onceki = durumu.planlar;
    durumu.planlar = yeni;
    if (kopru.planYaz(P.dosyaYaz(yeni, durumu.sinifSeviye, durumu.defterAcik))) return true;
    durumu.planlar = onceki;
    return false;
  }

  function planKaydet(onayli) {
    var pe = durumu.planEkle;
    var r = P.kayitYap(pe.sonuc, pe.ders, pe.seviye, pe.yil, D.isoTarih(new Date()));
    if (r.hata) { pe.hata = r.hata; ciz(); return; }
    if (!onayli && P.bul(durumu.planlar, pe.ders, pe.seviye)) {
      onayIste("Bu ders ve sınıf için kayıtlı plan yenisiyle DEĞİŞECEK. Devam edilsin mi?", function () { planKaydet(true); });
      return;
    }
    var yeni = P.ekle(durumu.planlar, r.kayit);
    if (!planlariKaydet(yeni)) { pe.hata = "Plan kaydedilemedi."; ciz(); return; }
    durumu.planEkle = null; durumu.sekme = "defter";
    durumu.planMesaj = "Plan kaydedildi: " + r.kayit.ders + " · " + r.kayit.seviye + ". sınıf · " + r.kayit.haftalar.length + " hafta.";
    ciz();
  }

  /** Defter sekmesinin üst kartı: şimdi süren / sıradaki dersin sınıfı + o haftanın süreç bileşeni + hafta gezgini. */
  function defterKarti(p) {
    var k = P.kart(p, durumu.planlar, durumu.sinifSeviye, new Date(), durumu.tatil, D);
    if (k.tur === "yok") return '<div class="kutu"><p>Programda ders bulunamadı.</p></div>';
    var hd = k.hedef, blok = hd.blok, et;
    if (hd.tur === "surer") et = "ŞİMDİ · " + blok.slot + ". DERS";
    else if (hd.tur === "arada") et = "SIRADAKİ · " + blok.baslangic;
    else et = "SIRADAKİ DERS · " + (hd.fark === 1 ? "Yarın" : D.GUN_ADLARI[hd.gun] + (hd.fark > 6 ? " " + gunAy(hd.tarih) : "")) + " " + blok.baslangic;
    var h = '<div class="dk"><div class="et">' + esc(et) + '</div><div class="b">' + esc(k.sinif) + '</div><div class="k">' +
      esc((k.ders ? D.baslikHarfi(k.ders) + " · " : "") + blok.baslangic + " – " + blok.bitis + " · " + blok.slot + ". ders") + "</div></div>";
    if (k.tur === "dersYok") {
      return h + '<div class="kutu uyari"><p>Bu saatte ders adı yazılı değil. Plan, ders adıyla eşleştirilir: Hafta sekmesinde bu hücreye uzun basıp ders adını yazın.</p></div>';
    }
    if (k.tur === "seviyeYok") {
      return h + '<div class="kutu uyari"><h2>Sınıf seviyesi?</h2><p>“' + esc(k.sinif) + '” adından sınıf seviyesi anlaşılamadı. Bu sınıf kaçıncı sınıf? (Bir kez sorulur, hatırlanır.)</p>' +
        '<div class="seg segsar">' + [5, 6, 7, 8, 9, 10, 11, 12].map(function (n) {
          return '<button data-act="sinifSeviye" data-sinif="' + esc(k.sinif) + '" data-v="' + n + '">' + n + "</button>";
        }).join("") + "</div></div>";
    }
    if (k.tur === "planYok") {
      return h + '<div class="kutu"><p>“' + esc(D.baslikHarfi(k.ders)) + " · " + k.seviye + '. sınıf” için yıllık plan eklenmemiş.</p>' +
        '<button class="dugme" data-act="planEkle">Plan ekle</button></div>';
    }
    // plan var: gezgin
    if (durumu.defterAnahtar !== k.anahtar) { durumu.defterAnahtar = k.anahtar; durumu.defterOfs = 0; }
    var n = k.plan.haftalar.length, idx = Math.max(0, Math.min(n - 1, k.idx + durumu.defterOfs));
    durumu.defterOfs = idx - k.idx;
    var w = k.plan.haftalar[idx], ofs = durumu.defterOfs, etk;
    if (ofs === 0) etk = !k.tarihPlanda ? "Bu tarih planda yok · en yakın hafta" : (hd.tur === "sonraki" ? "Sıradaki dersin haftası" : "Bu hafta");
    else etk = ofs < 0 ? Math.abs(ofs) + " hafta önce" : ofs + " hafta sonra";
    h += '<div class="gez"><button data-act="haftaGez" data-d="-1"' + (idx <= 0 ? " disabled" : "") + ' aria-label="Önceki hafta">◀</button>' +
      '<div class="gm"><b>' + (w.no ? w.no + ". hafta" : "Hafta") + "</b><span>" + esc(w.tarih) + "</span><small>" + esc(etk) + "</small></div>" +
      '<button data-act="haftaGez" data-d="1"' + (idx >= n - 1 ? " disabled" : "") + ' aria-label="Sonraki hafta">▶</button></div>';
    if (ofs !== 0) h += '<button class="dugme ikincil" data-act="haftaGez" data-d="0">Bu haftaya dön</button>';
    h += '<div class="metin' + (w.etkinlik ? " e" : "") + '">';
    if (w.bilesen.length) h += w.bilesen.map(function (b) { return "<p>" + esc(b) + "</p>"; }).join("");
    else h += "<p>Bu hafta için süreç bileşeni yazılı değil.</p>";
    return h + "</div>";
  }

  /** Kayıtlı planın tamamı: haftalar sırayla, tatiller gri satır, bu hafta vurgulu. */
  function planGorEkrani(pl) {
    var an = new Date();
    if (D.programGunu(an) >= 6) an = new Date(an.getFullYear(), an.getMonth(), an.getDate() + (8 - D.programGunu(an))); // hafta sonu: gelecek hafta vurgulanır (Defter kartıyla aynı)
    var bugun = D.isoTarih(an);
    var simdi = P.haftaBul(pl, bugun), hedef = -1, ogeler = [];
    pl.haftalar.forEach(function (w, i) { ogeler.push({ t: w.baslangic, w: w, i: i }); });
    (pl.ozel || []).forEach(function (o) { ogeler.push({ t: o.baslangic, o: o }); });
    ogeler.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
    if (simdi !== null) hedef = simdi;
    else for (var i = 0; i < pl.haftalar.length; i++) { if (pl.haftalar[i].baslangic >= bugun) { hedef = i; break; } }
    var h = '<div class="kutu">';
    ogeler.forEach(function (g) {
      if (g.o) {
        h += '<div class="hf tat"><div class="b">' + esc(g.o.ad) + " · " + esc(aralikYaz({ bas: g.o.baslangic, bit: g.o.bitis })) + "</div></div>";
        return;
      }
      var w = g.w;
      h += '<div class="hf' + (w.etkinlik ? " e" : "") + (g.i === simdi ? " bu" : "") + '"' + (g.i === hedef ? ' data-hedef="1"' : "") + ">" +
        '<div class="b">' + (w.no ? w.no + ". hafta · " : "") + esc(w.tarih) + (g.i === simdi ? " · bu hafta" : "") + '</div><div class="m">' + esc(w.bilesen.join("\n")) + "</div></div>";
    });
    h += "</div>";
    return h + '<button class="dugme ikincil" data-act="planGorKapat">Geri dön</button>' +
      '<button class="dugme ikincil" data-act="planSilGor">Bu planı sil</button>';
  }

  function defterEkrani() {
    var h = durumu.program ? defterKarti(durumu.program) : "";
    if (durumu.planMesaj) h += '<div class="kutu ok"><p>' + esc(durumu.planMesaj) + "</p></div>";
    h += '<div class="kutu"><h2>Yıllık planlar</h2>';
    if (!durumu.planlar.length) {
      h += "<p>Henüz plan eklenmedi. Deftere yazacağınız süreç bileşenlerini görmek için yıllık planınızı (Word .docx dosyası) ekleyin.</p>";
    } else {
      h += '<p class="not">Planın tamamını görmek için dokunun.</p>';
    }
    durumu.planlar.forEach(function (pl, i) {
      h += '<div class="tatil plgor" data-plgor="' + i + '"><span class="g">' + esc(pl.ders) + " · " + pl.seviye + '</span><span class="a">' + pl.haftalar.length + " hafta" +
        (pl.yil ? " · " + pl.yil[0] + "–" + String(pl.yil[1]).slice(2) : "") + '</span><span class="ok">›</span></div>';
    });
    h += '</div><button class="dugme" data-act="planEkle">Plan ekle</button>';
    return h;
  }

  window.uygulama = {
    planGeldi: function () {
      durumu.planEkle = { adim: "bekle" }; ciz();
      fetch("/gelen/plan.docx").then(function (r) { return r.arrayBuffer(); }).then(planIsle).catch(function (e) {
        durumu.planEkle = { adim: "hata", ileti: String(e) }; ciz();
      });
    },
    planHata: function (ileti) { durumu.planEkle = { adim: "hata", ileti: ileti }; ciz(); },
    pdfGeldi: function () {
      durumu.bekle = true; durumu.hata = null; ciz();
      fetch("/gelen/ders.pdf").then(function (r) { return r.arrayBuffer(); }).then(pdfIsle).catch(function (e) {
        durumu.bekle = false; durumu.hata = String(e); ciz();
      });
    },
    // Widget'a dokunulunca MainActivity çağırır: yarım kalmış bir PDF onayı/hatası yoksa verilen sekmeye geç
    sekme: function (ad) {
      if (durumu.program && !durumu.onay && !durumu.hata && !durumu.bekle && /^(hafta|gun|program|defter|ayarlar)$/.test(ad) && !durumu.planEkle && !durumu.planGor && (ad !== "defter" || durumu.defterAcik)) { durumu.sekme = ad; ciz(); }
    },
    pdfHata: function (ileti) { durumu.bekle = false; durumu.hata = ileti; ciz(); },
    yedekGeldi: function () {
      fetch("/gelen/yedek.json").then(function (r) { return r.text(); }).then(yedekIsle).catch(function (e) { durumu.mesaj = "Yedek okunamadı."; ciz(); });
    },
    yedekSonuc: function (o) { durumu.mesaj = o && o.ok ? "Yedek dosyası kaydedildi." : ((o && o.ileti) || "Yedek kaydedilemedi."); ciz(); },
    geri: function () {
      if (durumu.modal) { durumu.modal = null; modalCiz(); return true; }
      if (durumu.planEkle) { durumu.planEkle = null; ciz(); return true; }
      if (durumu.planGor) { durumu.planGor = null; ciz(); return true; }
      if (durumu.kur) {
        if (durumu.kur.adim === 2) { durumu.kur.adim = 1; ciz(); } else { durumu.kur = null; ciz(); }
        return true;
      }
      if (durumu.onay || durumu.hata) { durumu.onay = null; durumu.hata = null; ciz(); return true; }
      if (durumu.sekme !== "hafta" && durumu.program) { durumu.sekme = "hafta"; ciz(); return true; }
      return false;
    }
  };

  // ───────────── hesaplar ─────────────

  /** Çoğunluğun zili, farklı zilli günler ve sütunlar. */
  function zilDuzeni(p, gunler) {
    var imza = {}, say = {};
    gunler.forEach(function (g) {
      if (!p.zil[g]) return;
      imza[g] = JSON.stringify(p.zil[g]);
      say[imza[g]] = (say[imza[g]] || 0) + 1;
    });
    var enCok = null;
    Object.keys(say).forEach(function (k) { if (enCok === null || say[k] > say[enCok]) enCok = k; });
    var farkli = gunler.filter(function (g) { return imza[g] && imza[g] !== enCok; });
    return { zil: enCok ? JSON.parse(enCok) : {}, farkli: farkli };
  }

  /** Programın günleri: ders saati (zil) tanımlı günler; hiç yoksa Pzt–Cum. */
  function icerikGunleri(p) {
    var g = Object.keys(p.zil).map(Number).sort(function (a, b) { return a - b; });
    return g.length ? g : [1, 2, 3, 4, 5];
  }

  function enSlotSayisi(p) {
    var m = p.ders_saatleri.concat(p.ozel).reduce(function (a, x) { return Math.max(a, x.slot); }, 0);
    // Elle kurulan programda satırlar zilin tamamı kadardır (hücreler boş başlar); PDF'ten gelende yalnızca dolu saatlere kadar
    // (e-Okul zil tablosunu kullanılmayan 10.-12. saatlerle doldurur).
    if (p.kaynak === "elle") Object.keys(p.zil).forEach(function (g) { m = Math.max(m, Object.keys(p.zil[g]).length); });
    return m;
  }
  /** Hücrede görünecek ders kısaltması: PDF'teki kısa ad (KİM, SAĞ-TR…) ya da ders adının ilk 6 harfi. */
  function dersKisaltma(h) { var k = h.ders_kisa || h.ders || ""; return k.length > 6 ? k.slice(0, 6) : k; }
  var OZEL_KISA = { idari: "İdari", hazirlik: "Hazırl.", nobet: "Nöbet" };
  var OZEL_UZUN = { idari: "İdari görev", hazirlik: "Ders dışı hazırlık", nobet: "Nöbet" };

  // ───────────── bileşenler ─────────────

  function izgara(p, bugunGun, duzenle) {
    var gunler = icerikGunleri(p);
    var enSlot = enSlotSayisi(p);
    var zd = zilDuzeni(p, gunler);
    // birden fazla farklı ders varsa hücrede ders kısaltması da görünür
    var farkliDers = {};
    p.ders_saatleri.forEach(function (x) { farkliDers[x.ders_kisa || x.ders] = 1; });
    var cokDers = Object.keys(farkliDers).length > 1;
    var h = '<table class="izgara"><tr><th></th>';
    gunler.forEach(function (g) {
      h += '<th data-gun="' + g + '"' + (g === bugunGun ? ' class="bg"' : "") + ">" + D.GUN_KISA[g] + (zd.farkli.indexOf(g) >= 0 ? "*" : "") + "</th>";
    });
    h += "</tr>";
    for (var s = 1; s <= enSlot; s++) {
      h += '<tr><td class="h">' + esc(zd.zil[s] ? zd.zil[s][0] : s) + "</td>";
      gunler.forEach(function (g) {
        var ders = p.ders_saatleri.filter(function (x) { return x.gun === g && x.slot === s; })[0];
        var ozel = p.ozel.filter(function (x) { return x.gun === g && x.slot === s; })[0];
        var at = duzenle ? ' data-hucre="1" data-g="' + g + '" data-s="' + s + '"' : "";
        if (!p.zil[g] || !p.zil[g][s]) h += '<td class="yok"></td>';
        else if (ders) h += '<td class="d ' + sinifSinifi(ders.sinif) + '"' + at + ">" + esc(ders.sinif) + (cokDers ? "<small>" + esc(dersKisaltma(ders)) + "</small>" : "") + "</td>";
        else if (ozel) h += '<td class="d o"' + at + ">" + esc(ozel.tur === "diger" ? ozel.ad : (OZEL_KISA[ozel.tur] || "Görev")) + "</td>";
        else h += '<td class="d"' + at + "></td>";
      });
      h += "</tr>";
    }
    h += "</table>";
    if (zd.farkli.length) {
      var adlar = zd.farkli.map(function (g) { return D.GUN_ADLARI[g]; }).join(" ve ");
      h += '<div class="dipnot">* ' + esc(adlar) + " zili farklı: gün başlığına dokun → kendi saatleri</div>";
    }
    if (duzenle) {
      h += '<div class="dipnot">' + (p.ders_saatleri.length + p.ozel.length === 0 ? "Bir hücreye uzun basarak ders ekleyin. " : "Düzenlemek için bir hücreye uzun basın. ") + "</div>";
    }
    return h;
  }

  function kartMetni(p, simdi) {
    var r = D.metin(p, simdi, durumu.tatil);
    var et = "BUGÜN · " + buyuk(D.GUN_ADLARI[r.gun]);
    if (r.tur === "surer") {
      return { et: et, b: r.big, k: r.l1 + " · " + r.l2 + " · " + r.slot + ". ders" };
    }
    if (r.tur === "arada") return { et: et, b: r.l1 + " " + r.big + " başlayacak", k: r.sinif };
    return { et: et, b: r.big, k: [r.l1, r.l2].filter(Boolean).join(" · ") };
  }

  function bugunKarti(p) {
    var m = kartMetni(p, new Date());
    return '<div class="bugun"><div class="et">' + esc(m.et) + '</div><div class="b">' + esc(m.b) + '</div><div class="k">' + esc(m.k) + "</div></div>";
  }

  /** Günün TÜM ders saatleri: boş saatler, idari/hazırlık satırları, öğle arası ayracı. Saat solda, sınıf sağda. */
  function gunEkrani(p) {
    var gunler = icerikGunleri(p);
    var bugun = D.programGunu(new Date());
    var h = '<div class="gunler">';
    gunler.forEach(function (g) {
      h += '<button data-gun="' + g + '"' + (g === durumu.gun ? ' class="a"' : "") + ">" + D.GUN_KISA[g] + "</button>";
    });
    h += "</div>";
    var zil = p.zil[durumu.gun] || {};
    var slotlar = Object.keys(zil).map(Number).sort(function (x, y) { return x - y; });
    var icerik = {};
    p.ders_saatleri.filter(function (x) { return x.gun === durumu.gun; }).forEach(function (x) { icerik[x.slot] = { tur: "ders", sinif: x.sinif, ders: x.ders }; });
    p.ozel.filter(function (x) { return x.gun === durumu.gun; }).forEach(function (x) { icerik[x.slot] = { tur: x.tur, ad: x.ad }; });
    var var0 = false; // bu günde hiç ders/görev var mı
    slotlar.forEach(function (sl) { if (icerik[sl]) var0 = true; });
    if (!var0) return h + '<div class="bos-gun">Bu gün ders ya da görev yok</div>';
    // satırlar haftanın en geç dolu saatine kadar uzanır (haftalık ızgarayla aynı); günün son dersinden sonraki saatler de "boş" görünür
    var son = p.ders_saatleri.concat(p.ozel).reduce(function (m, x) { return Math.max(m, x.slot); }, 0);

    var an = new Date(), dkSimdi = an.getHours() * 60 + an.getMinutes();
    var tatil = durumu.gun === bugun ? D.tatilBul(durumu.tatil, D.isoTarih(an)) : null;
    var bugunMu = durumu.gun === bugun && !tatil;
    if (tatil) h += '<div class="tatil-not">Bugün tatil: ' + esc(tatil.ad) + "</div>";
    var hedef = 0; // açılışta görünecek satır: süren saat, yoksa ilk gelecek dolu saat
    if (bugunMu) {
      slotlar.forEach(function (sl) { if (sl <= son && !hedef && dkSimdi >= dk(zil[sl][0]) && dkSimdi < dk(zil[sl][1])) hedef = sl; });
      slotlar.forEach(function (sl) { if (sl <= son && !hedef && icerik[sl] && dk(zil[sl][0]) > dkSimdi) hedef = sl; });
    }
    var onceki = null;
    slotlar.forEach(function (sl) {
      if (sl > son) return;
      var z = zil[sl];
      if (onceki && dk(z[0]) - dk(onceki[1]) > 15) h += '<div class="ara">Öğle arası · ' + onceki[1] + "–" + z[0] + "</div>";
      onceki = z;
      var c = icerik[sl];
      var su = bugunMu && dkSimdi >= dk(z[0]) && dkSimdi < dk(z[1]);
      var zam = '<div class="z"><span class="b">' + z[0] + '</span><span class="k">' + z[1] + "</span></div>";
      var isaret = sl === hedef ? " data-hedef=\"1\"" : "";
      if (c && c.tur === "ders") {
        h += '<div class="sr ' + sinifSinifi(c.sinif) + (su ? " on" : "") + '"' + isaret + ">" + zam + '<div class="c"><span class="b">' + esc(c.sinif) +
          '</span><span class="k">' + esc(D.baslikHarfi(D.tamAd(p, c.ders))) + "</span></div></div>";
      } else if (c) {
        h += '<div class="sr ozel"' + isaret + ">" + zam + '<div class="c"><span class="b">' + esc(c.tur === "diger" ? c.ad : (OZEL_UZUN[c.tur] || "Görev")) + "</span></div></div>";
      } else {
        h += '<div class="sr bos"' + isaret + ">" + zam + '<div class="c"><span class="b">&nbsp;</span></div></div>'; // boş saat: yazı yok, saat soluk (kullanıcı kararı C)
      }
    });
    return h;
  }

  var AY_KISA = D.AYLAR;
  function gunAy(iso) { return parseInt(iso.slice(8, 10), 10) + " " + AY_KISA[parseInt(iso.slice(5, 7), 10) - 1]; }
  function aralikYaz(t) {
    if (t.bas === t.bit) return gunAy(t.bas);
    if (t.bas.slice(0, 7) === t.bit.slice(0, 7)) return parseInt(t.bas.slice(8, 10), 10) + "–" + gunAy(t.bit);
    return gunAy(t.bas) + " – " + gunAy(t.bit);
  }
  function segment(anahtar, secenekler) {
    return '<div class="seg">' + secenekler.map(function (o) {
      return '<button data-ayar="' + anahtar + '" data-v="' + o[0] + '"' + (durumu.ayar[anahtar] === o[0] ? ' class="a"' : "") + ">" + o[1] + "</button>";
    }).join("") + "</div>";
  }
  function ayarlarEkrani() {
    var bugunIso = D.isoTarih(new Date());
    var tatiller = durumu.tatil.map(function (t, i) { return { t: t, i: i }; }).filter(function (x) { return x.t.bit >= bugunIso; });
    var h = '<div class="kutu"><h2>Widget</h2>' +
      '<button class="dugme" data-act="widgetEkle" data-tur="gun">Günün programı widget\'ını ekle</button>' +
      '<button class="dugme" data-act="widgetEkle" data-tur="hafta">Haftalık program widget\'ını ekle</button><div class="not" id="widgetMesaj"></div>' +
      '<div class="ayar"><div class="et"><span>Zemin opaklığı (tüm widget\'lar)</span><b id="opDeger">%' + durumu.ayar.opaklik + '</b></div>' +
      '<input type="range" id="op" min="0" max="100" step="5" value="' + durumu.ayar.opaklik + '">' +
      '<div class="not">%100 tam dolu zemin; düşürdükçe zemin saydamlaşır, %0\'da yalnızca yazılar kalır (haftalık widget\'ta hücreler de kalır).</div></div>' +
      '<div class="ayar"><div class="et"><span>Yazı boyutu</span></div>' + segment("boyut", [["buyuk", "Büyük"], ["cok", "Çok büyük"]]) + "</div>" +
      '<div class="ayar"><div class="et"><span>Zemin rengi</span></div>' + segment("tema", [["krem", "Krem"], ["koyu", "Koyu"]]) + "</div>" +
      '<div class="ayar"><div class="et"><span>Yazı rengi (zemin saydamken)</span></div>' + segment("yazi", [["otomatik", "Otomatik"], ["koyu", "Koyu"], ["acik", "Açık"]]) + "</div></div>";
    h += '<div class="kutu"><h2>Tatil günleri</h2>';
    if (!tatiller.length) h += "<p>Yaklaşan tatil yok.</p>";
    tatiller.forEach(function (x) {
      h += '<div class="tatil"><span class="g">' + esc(aralikYaz(x.t)) + '</span><span class="a">' + esc(x.t.ad) + '</span><button data-tsil="' + x.i + '">Sil</button></div>';
    });
    h += '<div class="ayar"><div class="et"><span>Tatil ekle</span></div>' +
      '<div class="tarihler"><input type="date" id="tb"><input type="date" id="tt"></div>' +
      '<input type="text" id="ta" placeholder="Ad (isteğe bağlı)" maxlength="40">' +
      '<button class="dugme ikincil" data-act="tatilEkle">Ekle</button>' +
      '<div class="not">Tek gün için ikinci tarihi boş bırakın.</div></div></div>';
    h += '<div class="kutu"><h2>Defter sekmesi</h2><div class="seg">' +
      '<button data-act="defterAc" data-v="1"' + (durumu.defterAcik ? ' class="a"' : "") + ">Açık</button>" +
      '<button data-act="defterAc" data-v="0"' + (!durumu.defterAcik ? ' class="a"' : "") + ">Kapalı</button></div>" +
      '<div class="not">Ders defterine yazılacak süreç bileşenini yıllık plandan gösterir. Kapatınca sekme gizlenir, eklediğiniz planlar silinmez.</div></div>';
    var s0 = durumu.surum;
    h += '<div class="kutu"><h2>Hakkında</h2><div class="s"><span>Sürüm</span><span>' + (s0 ? esc(s0.ad) + " (" + s0.kod + ")" : "—") + "</span></div></div>";
    return h;
  }

  function widgetAyariKaydet() { kopru.widgetAyarYaz(JSON.stringify(durumu.ayar)); }
  function tatilKaydet() { kopru.tatilYaz(JSON.stringify(durumu.tatil)); }

  function ozetSatirlari(p) {
    var dersGunu = {};
    p.ders_saatleri.forEach(function (x) { dersGunu[x.gun] = 1; });
    var idari = p.ozel.filter(function (o) { return o.tur === "idari"; }).length;
    var haz = p.ozel.filter(function (o) { return o.tur === "hazirlik"; }).length;
    var nobet = p.ozel.filter(function (o) { return o.tur === "nobet"; }).length;
    var satir = function (a, b) { return '<div class="s"><span>' + a + "</span><span>" + esc(b) + "</span></div>"; };
    return satir("Öğretmen", p.ogretmen || "—") + satir("Okul", p.okul || "—") +
      satir("Geçerlilik başlangıcı", tarihYaz(p.gecerli_baslangic) || "—") +
      satir("Ders saati", p.ders_saatleri.length + " saat · " + Object.keys(dersGunu).length + " gün") +
      (idari ? satir("İdari görev", idari + " saat") : "") + (haz ? satir("Ders dışı hazırlık", haz + " saat") : "") +
      (nobet ? satir("Nöbet", nobet + " saat") : "");
  }

  // ───────────── elle program kurma ─────────────

  var KUR_GUNLERI = [1, 2, 3, 4, 5, 6, 7];

  function kurBaslat(p) {
    var k = { adim: 1, duzenleme: !!p, gunler: [1, 2, 3, 4, 5], esit: true, sayi: 8, sayilar: {}, ilk: "08:30", dersDk: 40, tenDk: 10,
      ogleSonra: 0, ogleDk: 45, yenidenUret: !p, ogretmen: "", okul: "", baslangic: D.isoTarih(new Date()), ana: [], farkli: {}, hatalar: [] };
    if (p) {
      var gz = Z.gunZilleri(p), gunler = Object.keys(gz).map(Number).sort(function (a, b) { return a - b; });
      k.gunler = gunler;
      gunler.forEach(function (g) { k.sayilar[g] = gz[g].length; });
      var adetler = gunler.map(function (g) { return gz[g].length; });
      k.esit = adetler.every(function (x) { return x === adetler[0]; });
      k.sayi = Math.max.apply(null, adetler);
      var imza = {}, say = {};
      gunler.forEach(function (g) { imza[g] = JSON.stringify(gz[g]); say[imza[g]] = (say[imza[g]] || 0) + 1; });
      var en = null;
      Object.keys(say).forEach(function (x) { if (en === null || say[x] > say[en]) en = x; });
      k.ana = JSON.parse(en);
      gunler.forEach(function (g) { if (imza[g] !== en) k.farkli[g] = gz[g].map(function (x) { return x.slice(); }); });
      k.ogretmen = p.ogretmen || ""; k.okul = p.okul || ""; k.baslangic = p.gecerli_baslangic || k.baslangic;
    }
    durumu.kur = k;
  }

  function kurSayilari(k) {
    var r = {};
    k.gunler.forEach(function (g) { r[g] = k.esit ? k.sayi : (k.sayilar[g] || k.sayi); });
    return r;
  }

  function uzat(liste, n) {
    var r = liste.slice(0, n).map(function (x) { return x.slice(); });
    while (r.length < n) r.push(["", ""]);
    return r;
  }

  /** Genel bilgiler → ders saatleri adımı. */
  function kurIleri() {
    var k = durumu.kur, h = [];
    if (!k.gunler.length) h.push("En az bir gün seçin.");
    var sayilar = kurSayilari(k), enCok = Math.max.apply(null, k.gunler.map(function (g) { return sayilar[g]; }).concat([0]));
    if (enCok < 1 || enCok > 14) h.push("Ders saati sayısı 1 ile 14 arasında olmalı.");
    if (k.yenidenUret) {
      if (!/^\d{1,2}:\d{2}$/.test(k.ilk || "")) h.push("İlk dersin başlangıç saatini girin.");
      if (!(k.dersDk >= 10 && k.dersDk <= 120)) h.push("Ders süresi 10 ile 120 dakika arasında olmalı.");
      if (!(k.tenDk >= 0 && k.tenDk <= 60)) h.push("Teneffüs süresi 0 ile 60 dakika arasında olmalı.");
      if (k.ogleSonra < 0 || k.ogleSonra > enCok) h.push("Öğle arası dersi, ders saati sayısını aşamaz.");
    }
    k.hatalar = h;
    if (h.length) { ciz(); return; }
    if (k.yenidenUret) { k.ana = Z.zilUret(k.ilk, k.dersDk, k.tenDk, enCok, k.ogleSonra, k.ogleDk); k.farkli = {}; }
    else { k.ana = uzat(k.ana, enCok); }
    Object.keys(k.farkli).forEach(function (g) {
      if (k.gunler.indexOf(+g) < 0) delete k.farkli[g]; else k.farkli[g] = uzat(k.farkli[g], sayilar[g]);
    });
    k.adim = 2;
    ciz();
  }

  function kurGunZil(k) {
    var sayilar = kurSayilari(k), r = {};
    k.gunler.slice().sort(function (a, b) { return a - b; }).forEach(function (g) {
      r[g] = k.farkli[g] ? k.farkli[g] : uzat(k.ana, sayilar[g]);
    });
    return r;
  }

  function kaydetProgram(p) {
    if (!kopru.programKaydet(JSON.stringify(p))) { durumu.hata = "Program kaydedilemedi."; ciz(); return; }
    durumu.program = p; durumu.kur = null; durumu.sekme = "hafta"; durumu.mesaj = "";
    ayarVeTatilYukle(); ciz();
  }

  function kurKaydet() {
    var k = durumu.kur, gz = kurGunZil(k), h = [];
    Object.keys(gz).forEach(function (g) {
      Z.zilHatalari(gz[g]).forEach(function (m) { h.push((k.farkli[g] ? D.GUN_ADLARI[g] + " — " : "") + m); });
    });
    k.hatalar = h.filter(function (m, i) { return h.indexOf(m) === i; });
    if (k.hatalar.length) { ciz(); return; }
    var ust = { ogretmen: k.ogretmen.trim() || null, okul: k.okul.trim() || null, baslangic: k.baslangic || null };
    if (!k.duzenleme) { kaydetProgram(Z.bosProgram(gz, ust)); return; }
    var r = Z.zilYenidenKur(durumu.program, gz);
    r.program.ogretmen = ust.ogretmen; r.program.okul = ust.okul; r.program.gecerli_baslangic = ust.baslangic;
    if (r.silinen > 0) onayIste("Bu değişiklikle " + r.silinen + " dolu hücre silinecek (kaldırılan gün ya da saatlere ait). Devam edilsin mi?", function () { kaydetProgram(r.program); });
    else kaydetProgram(r.program);
  }

  function adim(alan, deger, gun) {
    return '<div class="adim"><button data-act="kurSay" data-alan="' + alan + '" data-gun="' + (gun || "") + '" data-d="-1">−</button><b>' + deger +
      '</b><button data-act="kurSay" data-alan="' + alan + '" data-gun="' + (gun || "") + '" data-d="1">+</button></div>';
  }
  function alanGiris(etiket, alan, deger, tur, ek) {
    return '<label class="alan"><span>' + etiket + '</span><input type="' + tur + '" data-kur="' + alan + '" value="' + esc(deger) + '" ' + (ek || "") + "></label>";
  }

  function kurEkrani() {
    var k = durumu.kur, h = "";
    var hata = k.hatalar.length ? '<div class="kutu hata"><ul>' + k.hatalar.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul></div>" : "";
    if (k.adim === 1) {
      h += '<div class="kutu"><h2>Hangi günler ders var?</h2><div class="gunler">' + KUR_GUNLERI.map(function (g) {
        return '<button data-act="kurGun" data-gun="' + g + '"' + (k.gunler.indexOf(g) >= 0 ? ' class="a"' : "") + ">" + D.GUN_KISA[g] + "</button>";
      }).join("") + "</div></div>";
      h += '<div class="kutu"><h2>Günde kaç ders saati var?</h2><div class="ayar"><div class="et"><span>Her gün aynı sayıda mı?</span></div>' +
        '<div class="seg"><button data-act="kurEsit" data-v="1"' + (k.esit ? ' class="a"' : "") + '>Evet</button><button data-act="kurEsit" data-v="0"' + (!k.esit ? ' class="a"' : "") + ">Hayır</button></div></div>";
      if (k.esit) h += '<div class="satirsay"><span>Günlük ders saati</span>' + adim("sayi", k.sayi) + "</div>";
      else h += k.gunler.slice().sort(function (a, b) { return a - b; }).map(function (g) {
        return '<div class="satirsay"><span>' + D.GUN_ADLARI[g] + "</span>" + adim("gunsayi", k.sayilar[g] || k.sayi, g) + "</div>";
      }).join("");
      var sy = kurSayilari(k), toplam = k.gunler.reduce(function (t, g) { return t + sy[g]; }, 0);
      h += '<div class="not">Haftalık toplam: ' + toplam + " ders saati</div></div>";
      h += '<div class="kutu"><h2>Ders saatleri</h2>';
      if (k.duzenleme) h += '<label class="onay"><input type="checkbox" data-kurchk="yenidenUret"' + (k.yenidenUret ? " checked" : "") + "> Saatleri aşağıdaki bilgilerle yeniden oluştur</label>";
      if (k.yenidenUret) {
        h += alanGiris("İlk ders başlangıcı", "ilk", k.ilk, "time") + alanGiris("Ders süresi (dk)", "dersDk", k.dersDk, "number", 'min="10" max="120"') +
          alanGiris("Teneffüs (dk)", "tenDk", k.tenDk, "number", 'min="0" max="60"') +
          alanGiris("Şu dersten sonra öğle arası (0 = yok)", "ogleSonra", k.ogleSonra, "number", 'min="0" max="14"') +
          alanGiris("Öğle arası süresi (dk)", "ogleDk", k.ogleDk, "number", 'min="0" max="180"') +
          '<div class="not">Bir sonraki adımda saatleri tek tek düzeltebilirsiniz.</div>';
      } else h += '<div class="not">Mevcut ders saatleri korunur; bir sonraki adımda düzenlenebilir.</div>';
      h += "</div>";
      h += '<div class="kutu"><h2>Bilgiler (isteğe bağlı)</h2>' + alanGiris("Öğretmen", "ogretmen", k.ogretmen, "text", 'maxlength="40"') +
        alanGiris("Okul", "okul", k.okul, "text", 'maxlength="60"') + alanGiris("Programın başlangıç tarihi", "baslangic", k.baslangic, "date") + "</div>";
      h += hata + '<button class="dugme" data-act="kurIleri">İleri: ders saatleri</button><button class="dugme ikincil" data-act="kurIptal">Vazgeç</button>';
    } else {
      var satir = function (liste, anahtar) {
        return liste.map(function (z, i) {
          return '<div class="zil"><span>' + (i + 1) + ". ders</span><input type=\"time\" data-zil=\"" + anahtar + '" data-i="' + i + '" data-k="0" value="' + esc(z[0]) +
            '"><i>–</i><input type="time" data-zil="' + anahtar + '" data-i="' + i + '" data-k="1" value="' + esc(z[1]) + '"></div>';
        }).join("");
      };
      var sy2 = kurSayilari(k), enCok = Math.max.apply(null, k.gunler.map(function (g) { return sy2[g]; }));
      h += '<div class="kutu"><h2>Ders saatleri</h2><div class="not">Tüm günler için ortak. Kısa günlerde ilk saatler kullanılır.</div>' + satir(uzat(k.ana, enCok), "ana") + "</div>";
      h += '<div class="kutu"><h2>Saatleri farklı olan günler</h2><div class="not">Örneğin Cuma\'nın zili farklıysa o günü seçip kendi saatlerini girin.</div><div class="gunler">' +
        k.gunler.slice().sort(function (a, b) { return a - b; }).map(function (g) {
          return '<button data-act="kurFarkli" data-gun="' + g + '"' + (k.farkli[g] ? ' class="a"' : "") + ">" + D.GUN_KISA[g] + "</button>";
        }).join("") + "</div>";
      Object.keys(k.farkli).sort().forEach(function (g) { h += "<h3>" + D.GUN_ADLARI[g] + "</h3>" + satir(k.farkli[g], "g" + g); });
      h += "</div>";
      h += hata + '<button class="dugme" data-act="kurKaydet">Kaydet</button><button class="dugme ikincil" data-act="kurGeri">Geri</button>';
    }
    return h;
  }

  // ───────────── pencereler: hücre düzenleme + onay ─────────────

  var bekleyenEylem = null;
  function onayIste(metin, evet) { bekleyenEylem = evet; durumu.modal = { tur: "onay", metin: metin }; modalCiz(); }

  var HUCRE_TURLERI = [["ders", "Ders"], ["idari", "İdari"], ["hazirlik", "Hazırlık"], ["nobet", "Nöbet"], ["diger", "Diğer"], ["bos", "Boş"]];

  function hucrePenceresiAc(gun, slot) {
    var p = durumu.program;
    var z = p.zil[gun] && p.zil[gun][slot];
    if (!z) return;
    var d = p.ders_saatleri.filter(function (x) { return x.gun === gun && x.slot === slot; })[0];
    var o = p.ozel.filter(function (x) { return x.gun === gun && x.slot === slot; })[0];
    var a = { tur: "ders", sinif: "", ders: "", ad: "", sonraki: false, hepsi: false };
    if (d) { a.sinif = d.sinif; a.ders = d.ders === d.sinif ? "" : d.ders; }
    else if (o) { a.tur = o.tur; a.ad = o.ad || ""; }
    durumu.modal = { tur: "hucre", gun: gun, slot: slot, saat: z[0] + "–" + z[1], eskiSinif: d ? d.sinif : null, alan: a, hata: "" };
    modalCiz();
  }

  function hucreKaydet() {
    var m = durumu.modal, a = m.alan, p = durumu.program;
    var r = Z.hucreAyarla(p, m.gun, m.slot, { tur: a.tur, sinif: a.sinif, ders: a.ders, ad: a.ad });
    if (r.hata) { m.hata = r.hata; modalCiz(); return; }
    if (a.tur === "ders" && a.hepsi && m.eskiSinif && m.eskiSinif !== a.sinif.trim().toLocaleUpperCase("tr-TR")) {
      r = Z.sinifAdiDegistir(r, m.eskiSinif, a.sinif);
      if (r.hata) { m.hata = r.hata; modalCiz(); return; }
    }
    if (a.sonraki && r.zil[m.gun] && r.zil[m.gun][m.slot + 1]) {
      r = Z.hucreAyarla(r, m.gun, m.slot + 1, { tur: a.tur, sinif: a.sinif, ders: a.ders, ad: a.ad });
      if (r.hata) { m.hata = r.hata; modalCiz(); return; }
    }
    if (!kopru.programKaydet(JSON.stringify(r))) { m.hata = "Kaydedilemedi."; modalCiz(); return; }
    durumu.program = r; durumu.modal = null; modalCiz(); ciz();
  }

  function modalCiz() {
    var el = document.getElementById("modal"), m = durumu.modal;
    if (!m) { el.innerHTML = ""; el.style.display = "none"; return; }
    var h;
    if (m.tur === "onay") {
      h = '<p class="mp">' + esc(m.metin) + '</p><button class="dugme" data-act="modalEvet">Devam et</button><button class="dugme ikincil" data-act="modalIptal">Vazgeç</button>';
    } else {
      var a = m.alan, S = Z.SINIR;
      h = "<h3>" + D.GUN_ADLARI[m.gun] + " · " + m.slot + ". ders</h3><div class=\"mz\">" + m.saat + '</div><div class="mtur">' + HUCRE_TURLERI.map(function (t) {
        return '<button data-act="mTur" data-v="' + t[0] + '"' + (a.tur === t[0] ? ' class="a"' : "") + ">" + t[1] + "</button>";
      }).join("") + "</div>";
      if (a.tur === "ders") {
        h += '<label class="alan"><span>Sınıf / başlık (en çok ' + S.baslik + ' karakter)</span><input type="text" data-m="sinif" maxlength="' + S.baslik + '" value="' + esc(a.sinif) + '" autocapitalize="characters"></label>' +
          '<label class="alan"><span>Ders adı (en çok ' + S.ders + ' karakter)</span><input type="text" data-m="ders" maxlength="' + S.ders + '" value="' + esc(a.ders) + '"></label>' +
          (durumu.program.zil[m.gun][m.slot + 1] ? '<label class="onay"><input type="checkbox" data-mchk="sonraki"' + (a.sonraki ? " checked" : "") + "> Sonraki saate de uygula</label>" : "") +
          (m.eskiSinif ? '<label class="onay"><input type="checkbox" data-mchk="hepsi"' + (a.hepsi ? " checked" : "") + "> “" + esc(m.eskiSinif) + "” yazılan her yerde değiştir</label>" : "");
      } else if (a.tur === "diger") {
        h += '<label class="alan"><span>Yazı (en çok ' + S.baslik + ' karakter)</span><input type="text" data-m="ad" maxlength="' + S.baslik + '" value="' + esc(a.ad) + '"></label>';
      } else if (a.tur === "bos") {
        h += '<p class="mp">Bu saat boş olarak kaydedilir.</p>';
      }
      if (m.hata) h += '<div class="mhata">' + esc(m.hata) + "</div>";
      h += '<button class="dugme" data-act="modalKaydet">Kaydet</button><button class="dugme ikincil" data-act="modalIptal">Vazgeç</button>';
    }
    el.innerHTML = '<div class="mkart">' + h + "</div>";
    el.style.display = "block";
    var ilk = el.querySelector("input[type=text]");
    if (ilk && !ilk.value) ilk.focus();
  }

  // ───────────── yedek ─────────────

  function yedekIsle(metin) {
    var o = Z.yedekOku(metin);
    if (o.hata) { durumu.mesaj = o.hata; ciz(); return; }
    var planMetni = o.planlar && o.planlar.length ? " ve " + o.planlar.length + " yıllık plan" : "";
    onayIste("Telefondaki program" + planMetni + ", yedektekiyle değişecek (" + (o.program.ogretmen || "adsız") + ", " + o.program.ders_saatleri.length + " ders saati). Devam edilsin mi?", function () {
      if (o.planlar) {
        if (o.sinifSeviye) durumu.sinifSeviye = P.dosyaOku(P.dosyaYaz([], o.sinifSeviye)).sinifSeviye;
        planlariKaydet(P.listeOku(P.listeYaz(o.planlar)));
      }
      kopru.programKaydet(JSON.stringify(o.program));
      kopru.tatilYaz(JSON.stringify(o.tatil));
      kopru.widgetAyarYaz(JSON.stringify(Object.assign({}, durumu.ayar, o.widgetAyar)));
      durumu.program = o.program; durumu.sekme = "hafta"; durumu.mesaj = "Yedek geri yüklendi.";
      ayarVeTatilYukle(); ciz();
    });
  }

  // ───────────── ekranlar ─────────────

  function ciz() {
    var ust = document.getElementById("baslik"), alt = document.getElementById("altbaslik");
    var ic = document.getElementById("icerik"), nav = document.getElementById("alt");
    var p = durumu.program, h = "", navGoster = false;
    if (durumu.sekme === "defter" && !durumu.defterAcik) durumu.sekme = "hafta";
    var kaydirma = ic.scrollTop, oncekiEkran = ic.dataset.ekran;

    if (durumu.bekle) {
      ust.textContent = "Haftalık Ders Programı"; alt.textContent = "PDF okunuyor";
      h = '<div class="bekle">PDF okunuyor…</div>';
    } else if (durumu.hata) {
      ust.textContent = "Program okunamadı"; alt.textContent = "Hiçbir şey kaydedilmedi";
      h = '<div class="kutu hata"><h2>Bu PDF okunamadı</h2><p>' + esc(durumu.hata) + '</p></div>' +
        '<button class="dugme" data-act="sec">Başka PDF seç</button><button class="dugme ikincil" data-act="vazgec">Geri dön</button>';
    } else if (durumu.planEkle) {
      var pe = durumu.planEkle;
      if (pe.adim === "bekle") {
        ust.textContent = "Yıllık Plan"; alt.textContent = "Plan okunuyor";
        h = '<div class="bekle">Plan okunuyor…</div>';
      } else if (pe.adim === "hata") {
        ust.textContent = "Plan okunamadı"; alt.textContent = "Hiçbir şey kaydedilmedi";
        h = '<div class="kutu hata"><h2>Bu plan okunamadı</h2><p>' + esc(pe.ileti) + '</p></div>' +
          '<button class="dugme" data-act="planEkle">Başka dosya seç</button><button class="dugme ikincil" data-act="planVazgec">Geri dön</button>';
      } else {
        ust.textContent = pe.adim === "sutun" ? "Plan sütunu" : "Okunan Plan";
        alt.textContent = pe.adim === "sutun" ? "Hangi sütun süreç bileşeni?" : "Kaydetmeden önce kontrol edin";
        h = planEkrani(pe);
      }
    } else if (durumu.planGor && durumu.planlar[durumu.planGor.i]) {
      var plg = durumu.planlar[durumu.planGor.i];
      ust.textContent = plg.ders + " · " + plg.seviye + ". sınıf";
      alt.textContent = plg.haftalar.length + " hafta" + (plg.yil ? " · " + plg.yil[0] + "–" + plg.yil[1] : "");
      h = planGorEkrani(plg);
    } else if (durumu.onay) {
      var o = durumu.onay;
      ust.textContent = "Ayıklanan Program"; alt.textContent = "Kaydetmeden önce kontrol edin";
      h = '<div class="kutu">' + ozetSatirlari(o) + '</div>' +
        (o.uyarilar && o.uyarilar.length
          ? '<div class="kutu uyari"><h2>Dikkat</h2><p>PDF\'in kendi toplamlarıyla uyuşmayan yerler var. PDF elle düzenlenmişse bu beklenir. ' +
            'Aşağıdaki programı kontrol edin, doğruysa kaydedin.</p><ul>' + o.uyarilar.map(function (u) { return "<li>" + esc(u) + "</li>"; }).join("") + "</ul></div>"
          : '<div class="kutu ok"><p>Doğrulandı: ayıklanan saatler PDF\'in kendi toplamlarıyla (maaşlı, ücretli, idari görev) uyuşuyor.</p></div>') +
        izgara(o, -1, false) +
        '<button class="dugme" data-act="kaydet">Kaydet</button><button class="dugme ikincil" data-act="vazgec">Vazgeç</button>';
    } else if (durumu.kur) {
      var kk = durumu.kur;
      ust.textContent = kk.duzenleme ? "Ders Saatlerini Düzenle" : "Program Kur";
      alt.textContent = kk.adim === 1 ? "1/2 · Günler ve ders saati sayısı" : "2/2 · Ders giriş ve çıkış saatleri";
      h = kurEkrani();
    } else if (!p) {
      ust.textContent = "Haftalık Ders Programı"; alt.textContent = "Başlamak için ders programınızı ekleyin";
      h = '<div class="merkez"><div class="b">Ders programınızı ekleyin</div>' +
        "<p>Ders programınızın PDF'ini seçin, program otomatik okunur. Ya da programı kendiniz girin.</p>" +
        '<button class="dugme" data-act="sec">PDF\'den yükle</button><button class="dugme ikincil" data-act="kurBasla">Elle program gir</button>' +
        '<button class="dugme ikincil" data-act="yedekYukle">Yedekten geri yükle</button>' + (durumu.mesaj ? '<div class="not">' + esc(durumu.mesaj) + "</div>" : "") + "</div>";
    } else {
      navGoster = true;
      if (durumu.sekme === "hafta") {
        ust.textContent = "Haftalık Program";
        alt.textContent = tarihYaz(p.gecerli_baslangic) + " tarihinden beri geçerli";
        h = bugunKarti(p) + izgara(p, D.programGunu(new Date()), true);
      } else if (durumu.sekme === "gun") {
        ust.textContent = "Günün Programı";
        alt.textContent = D.GUN_ADLARI[durumu.gun] + (durumu.gun === D.programGunu(new Date()) ? " · bugün" : "");
        h = gunEkrani(p);
      } else if (durumu.sekme === "defter") {
        ust.textContent = "Defter"; alt.textContent = "Yıllık plan · süreç bileşenleri";
        h = defterEkrani();
      } else if (durumu.sekme === "program") {
        ust.textContent = "Program"; alt.textContent = p.kaynak === "elle" ? "Elle girilen program" : (p.duzenlendi ? "PDF'den okundu · düzenlendi" : "PDF'den okundu");
        h = '<div class="kutu">' + ozetSatirlari(p) + '</div>' + (durumu.mesaj ? '<div class="kutu ok"><p>' + esc(durumu.mesaj) + "</p></div>" : "") +
          '<button class="dugme" data-act="sec">Yeni program yükle (PDF)</button>' +
          '<button class="dugme ikincil" data-act="kurDuzenle">Ders saatlerini ve günleri düzenle</button>' +
          '<button class="dugme ikincil" data-act="yedekAl">Yedek al (dosyaya)</button>' +
          '<button class="dugme ikincil" data-act="yedekYukle">Yedekten geri yükle</button>' +
          '<button class="dugme ikincil" data-act="sil">Programı sil</button>';
      } else {
        ust.textContent = "Ayarlar"; alt.textContent = "Widget ve tatil günleri";
        h = ayarlarEkrani();
      }
    }
    var ekran = [durumu.bekle, !!durumu.hata, !!durumu.onay, !!p, durumu.sekme, durumu.gun, durumu.kur ? "kur" + durumu.kur.adim : "", durumu.planEkle ? "pl" + durumu.planEkle.adim : "", durumu.planGor ? "gor" + durumu.planGor.i : ""].join();
    ic.innerHTML = h;
    ic.dataset.ekran = ekran;
    ic.scrollTop = ekran === oncekiEkran ? kaydirma : 0; // aynı ekranın tazelenmesinde kaydırma korunur
    if (ekran !== oncekiEkran && (durumu.sekme === "gun" || durumu.planGor)) { // Bugün sekmesi / plan ekranı açılınca şu anki/sıradaki öğeye kaydır
      var hd = ic.querySelector("[data-hedef]");
      if (hd) ic.scrollTop = Math.max(0, hd.getBoundingClientRect().top - ic.getBoundingClientRect().top + ic.scrollTop - 90);
    }
    modalCiz();
    nav.style.display = navGoster ? "flex" : "none";
    nav.innerHTML = navGoster ? sekmeListesi().map(function (t) {
      return '<button data-sekme="' + t[0] + '"' + (durumu.sekme === t[0] ? ' class="a"' : "") + ">" + t[1] + "</button>";
    }).join("") : "";
  }

  document.addEventListener("click", function (e) {
    var tsil = e.target.closest("[data-tsil]");
    if (tsil) { durumu.tatil.splice(parseInt(tsil.dataset.tsil, 10), 1); tatilKaydet(); ciz(); return; }
    var plgor = e.target.closest("[data-plgor]");
    if (plgor) { durumu.planGor = { i: parseInt(plgor.dataset.plgor, 10) }; ciz(); return; }
    var ay = e.target.closest("[data-ayar]");
    if (ay) { durumu.ayar[ay.dataset.ayar] = ay.dataset.v; widgetAyariKaydet(); ciz(); return; }
    if (uzunBasildi) { uzunBasildi = false; return; } // uzun basmanın ardından gelen tıklamayı yut
    var hu = e.target.closest("[data-hucre]");
    if (hu && durumu.program && !durumu.onay && !durumu.kur && !durumu.modal) { durumu.gun = parseInt(hu.dataset.g, 10); durumu.sekme = "gun"; ciz(); return; }
    var el = e.target.closest("[data-act],[data-sekme],[data-gun]");
    if (!el) return;
    if (el.dataset.act) {
      var a = el.dataset.act;
      var k = durumu.kur, m = durumu.modal;
      if (a === "modalIptal") { durumu.modal = null; modalCiz(); return; }
      if (a === "modalEvet") { var ev = bekleyenEylem; bekleyenEylem = null; durumu.modal = null; modalCiz(); if (ev) ev(); return; }
      if (a === "modalKaydet") { hucreKaydet(); return; }
      if (a === "planEkle") { durumu.planMesaj = ""; kopru.planSec(); return; }
      if (a === "planVazgec") { durumu.planEkle = null; ciz(); return; }
      if (a === "planSutun") {
        var pe0 = durumu.planEkle;
        planDegerlendir(pe0.xml, Object.assign({}, pe0.secenek, { sutunBilesen: parseInt(el.dataset.i, 10) }));
        return;
      }
      if (a === "planDers") { durumu.planEkle.ders = el.dataset.v; ciz(); return; }
      if (a === "planSeviye") { durumu.planEkle.seviye = parseInt(el.dataset.v, 10); ciz(); return; }
      if (a === "planYil") {
        var pe1 = durumu.planEkle, yy = el.dataset.v.split("-").map(Number);
        planDegerlendir(pe1.xml, Object.assign({}, pe1.secenek, { yil: yy }));
        return;
      }
      if (a === "planKaydet") { planKaydet(false); return; }
      if (a === "planGorKapat") { durumu.planGor = null; ciz(); return; }
      if (a === "planSilGor") {
        var pl = durumu.planlar[durumu.planGor.i];
        if (pl) onayIste(pl.ders + " · " + pl.seviye + ". sınıf planı silinecek. Devam edilsin mi?", function () {
          var yeni = P.kaldir(durumu.planlar, pl.anahtar);
          if (planlariKaydet(yeni)) { durumu.planGor = null; durumu.planMesaj = "Plan silindi."; ciz(); }
        });
        return;
      }
      if (a === "haftaGez") {
        var dd = parseInt(el.dataset.d, 10);
        durumu.defterOfs = dd === 0 ? 0 : durumu.defterOfs + dd;
        ciz(); return;
      }
      if (a === "sinifSeviye") {
        durumu.sinifSeviye[el.dataset.sinif] = parseInt(el.dataset.v, 10);
        planlariKaydet(durumu.planlar); ciz(); return;
      }
      if (a === "defterAc") {
        durumu.defterAcik = el.dataset.v === "1";
        planlariKaydet(durumu.planlar);
        if (!durumu.defterAcik && durumu.sekme === "defter") durumu.sekme = "hafta";
        ciz(); return;
      }
      if (a === "mTur") { m.alan.tur = el.dataset.v; m.hata = ""; modalCiz(); return; }
      if (a === "kurBasla") { kurBaslat(null); ciz(); return; }
      if (a === "kurDuzenle") { kurBaslat(durumu.program); ciz(); return; }
      if (a === "kurIptal") { durumu.kur = null; ciz(); return; }
      if (a === "kurGeri") { k.adim = 1; ciz(); return; }
      if (a === "kurIleri") { kurIleri(); return; }
      if (a === "kurKaydet") { kurKaydet(); return; }
      if (a === "kurGun") {
        var g0 = parseInt(el.dataset.gun, 10), i0 = k.gunler.indexOf(g0);
        if (i0 >= 0) k.gunler.splice(i0, 1); else k.gunler.push(g0);
        ciz(); return;
      }
      if (a === "kurEsit") { k.esit = el.dataset.v === "1"; if (!k.esit) k.gunler.forEach(function (g) { if (!k.sayilar[g]) k.sayilar[g] = k.sayi; }); ciz(); return; }
      if (a === "kurSay") {
        var dlt = parseInt(el.dataset.d, 10);
        if (el.dataset.alan === "sayi") k.sayi = Math.max(1, Math.min(14, k.sayi + dlt));
        else { var gg = parseInt(el.dataset.gun, 10); k.sayilar[gg] = Math.max(1, Math.min(14, (k.sayilar[gg] || k.sayi) + dlt)); }
        ciz(); return;
      }
      if (a === "kurFarkli") {
        var g1 = parseInt(el.dataset.gun, 10);
        if (k.farkli[g1]) delete k.farkli[g1];
        else k.farkli[g1] = uzat(k.ana, kurSayilari(k)[g1]);
        ciz(); return;
      }
      if (a === "yedekAl") { durumu.mesaj = ""; if (!kopru.yedekKaydet(Z.yedekYap(durumu.program, durumu.tatil, durumu.ayar, durumu.planlar, durumu.sinifSeviye))) { durumu.mesaj = "Yedek kaydedilemedi."; ciz(); } return; }
      if (a === "yedekYukle") { durumu.mesaj = ""; kopru.yedekAc(); return; }
      if (a === "sec" && durumu.program && (durumu.program.kaynak === "elle" || durumu.program.duzenlendi)) {
        onayIste("Elle girdiğiniz ya da düzenlediğiniz program, seçeceğiniz yeni PDF ile DEĞİŞECEK. Önce yedek almak isteyebilirsiniz. Devam edilsin mi?", function () { kopru.pdfSec(); });
        return;
      }
      if (a === "sec") kopru.pdfSec();
      else if (a === "vazgec") { durumu.onay = null; durumu.hata = null; ciz(); }
      else if (a === "kaydet") {
        durumu.onay.kaynak = "pdf"; durumu.onay.duzenlendi = false;
        if (kopru.programKaydet(JSON.stringify(durumu.onay))) {
          durumu.program = durumu.onay; durumu.onay = null; durumu.sekme = "hafta"; ayarVeTatilYukle(); ciz();
        } else { durumu.hata = "Program kaydedilemedi."; durumu.onay = null; ciz(); }
      } else if (a === "widgetEkle") {
        if (!kopru.widgetEkle(el.dataset.tur || "gun")) document.getElementById("widgetMesaj").textContent = "Bu telefon widget'ın doğrudan eklenmesini desteklemiyor. Ana ekrana uzun basıp Widget'lar bölümünden ekleyin.";
      } else if (a === "tatilEkle") {
        var tb = document.getElementById("tb").value, tt = document.getElementById("tt").value || tb;
        if (!tb) return;
        if (tt < tb) { var x = tb; tb = tt; tt = x; }
        durumu.tatil.push({ bas: tb, bit: tt, ad: document.getElementById("ta").value.trim() || "Tatil" });
        durumu.tatil.sort(function (p, q) { return p.bas < q.bas ? -1 : p.bas > q.bas ? 1 : 0; });
        tatilKaydet(); ciz();
      } else if (a === "sil") {
        onayIste("Kayıtlı program silinecek. Önce yedek almak isteyebilirsiniz. Devam edilsin mi?", function () {
          if (kopru.programSil()) { durumu.program = null; durumu.sekme = "hafta"; durumu.mesaj = ""; ciz(); }
        });
      }
    } else if (el.dataset.sekme) {
      durumu.sekme = el.dataset.sekme;
      durumu.planMesaj = "";
      durumu.defterOfs = 0; // Defter sekmesi her açılışta bugünün haftasıyla başlar
      if (durumu.sekme === "gun") durumu.gun = D.programGunu(new Date());
      ciz();
    } else if (el.dataset.gun) {
      durumu.gun = parseInt(el.dataset.gun, 10); durumu.sekme = "gun"; ciz();
    }
  });

  // Izgara hücresine UZUN basınca (yarım saniye) düzenleme penceresi açılır; kısa dokunuş o günün Bugün sekmesini açar.
  var uzunZamanlayici = null, uzunBasildi = false, uzunBaslangic = null;
  function uzunIptal() { if (uzunZamanlayici) { clearTimeout(uzunZamanlayici); uzunZamanlayici = null; } }
  document.addEventListener("pointerdown", function (e) {
    var hu = e.target.closest("[data-hucre]");
    if (!hu || !durumu.program || durumu.onay || durumu.kur || durumu.modal) return;
    uzunBaslangic = { x: e.clientX, y: e.clientY };
    uzunIptal();
    uzunZamanlayici = setTimeout(function () {
      uzunZamanlayici = null; uzunBasildi = true;
      if (navigator.vibrate) navigator.vibrate(15);
      hucrePenceresiAc(parseInt(hu.dataset.g, 10), parseInt(hu.dataset.s, 10));
    }, 500);
  });
  document.addEventListener("pointermove", function (e) {
    if (uzunZamanlayici && uzunBaslangic && (Math.abs(e.clientX - uzunBaslangic.x) > 10 || Math.abs(e.clientY - uzunBaslangic.y) > 10)) uzunIptal(); // kaydırma
  });
  ["pointerup", "pointercancel"].forEach(function (a) {
    document.addEventListener(a, function () {
      uzunIptal();
      // Parmak kalkınca bayrak kısa süre sonra kendiliğinden düşer; tıklama hiç gelmezse penceredeki ilk dokunuş yutulmasın.
      if (uzunBasildi) setTimeout(function () { uzunBasildi = false; }, 350);
    });
  });
  document.addEventListener("contextmenu", function (e) { if (e.target.closest("[data-hucre]")) e.preventDefault(); });
  document.addEventListener("scroll", uzunIptal, true);

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "op") document.getElementById("opDeger").textContent = "%" + t.value;
    if (t.dataset.kur && durumu.kur) {
      var sayisal = ["dersDk", "tenDk", "ogleSonra", "ogleDk"].indexOf(t.dataset.kur) >= 0;
      durumu.kur[t.dataset.kur] = sayisal ? (t.value === "" ? NaN : parseInt(t.value, 10)) : t.value;
    }
    if (t.dataset.zil && durumu.kur) {
      var liste = t.dataset.zil === "ana" ? durumu.kur.ana : durumu.kur.farkli[t.dataset.zil.slice(1)];
      var idx = parseInt(t.dataset.i, 10);
      if (t.dataset.zil === "ana" && !liste[idx]) liste[idx] = ["", ""];
      if (liste && liste[idx]) liste[idx][parseInt(t.dataset.k, 10)] = t.value;
    }
    if (t.dataset.m && durumu.modal) durumu.modal.alan[t.dataset.m] = t.value;
    if (t.dataset.pl && durumu.planEkle) durumu.planEkle[t.dataset.pl] = t.value;
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset.mchk && durumu.modal) durumu.modal.alan[t.dataset.mchk] = t.checked;
    if (t.dataset.kurchk && durumu.kur) { durumu.kur[t.dataset.kurchk] = t.checked; ciz(); }
    if (e.target.id === "op") { durumu.ayar.opaklik = parseInt(e.target.value, 10); widgetAyariKaydet(); }
  });

  // Açıkken "şimdi" bilgisi yarım dakikada bir tazelenir; sayfa görünür değilken hiçbir şey yapılmaz.
  function tazele() {
    if (document.visibilityState === "visible" && durumu.program && !durumu.onay && !durumu.hata && !durumu.bekle && !durumu.planEkle && !durumu.modal &&
        (durumu.sekme === "hafta" || durumu.sekme === "gun" || durumu.sekme === "defter")) ciz();
  }
  setInterval(tazele, 30000);
  document.addEventListener("visibilitychange", tazele);

  fetch("surum.json").then(function (r) { return r.json(); }).then(function (s) { durumu.surum = s; ciz(); }).catch(function () {});
  function ayarVeTatilYukle() {
    try { var a = JSON.parse(kopru.widgetAyarOku() || "{}"); Object.keys(a).forEach(function (k) { durumu.ayar[k] = a[k]; }); } catch (e) { /* varsayılanlar */ }
    var l = null;
    try { l = JSON.parse(kopru.tatilOku() || "null"); } catch (e) { l = null; }
    if (!Array.isArray(l) && durumu.program) { // ilk kez: varsayılan tatilleri yaz
      l = window.Tatil.varsayilan(durumu.program.gecerli_baslangic);
      kopru.tatilYaz(JSON.stringify(l));
    }
    durumu.tatil = Array.isArray(l) ? l : [];
  }
  durumu.program = programYukle();
  var defterVeri = P.dosyaOku(kopru.planOku());
  durumu.planlar = defterVeri.planlar; durumu.sinifSeviye = defterVeri.sinifSeviye; durumu.defterAcik = defterVeri.sekmeAcik;
  ayarVeTatilYukle();
  ciz();
})();
