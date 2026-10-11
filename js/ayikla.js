/* e-Okul "Ders Programı" PDF'inden gelen metin parçalarını ders programına çevirir.
 *
 * Girdi: [{s: metin, x: sol kenar, y: yukarıdan taban çizgisi, w: genişlik}] (pdf.js'ten, pdfOku.js üretir).
 * Çıktı: arac/ayikla.py ile BİREBİR aynı yapı (testler/test_ayikla_js.mjs bunu veri/program.json ile karşılaştırır).
 * Saf işlevdir: pdf.js'e ya da tarayıcıya bağımlı değildir; Node'da da çalışır.
 *
 * Yöntem: sütunlar "(1)…(12)" başlıklarının merkezinden, satırlar gün adlarının ve "Saat" etiketlerinin
 * konumundan bulunur. Sonuç PDF'in kendi toplamlarıyla (Ma./Üc sütunları, alttaki (M)/(İd)/(D) satırı)
 * çapraz kontrol edilir; tutmazsa hata fırlatılır ve hiçbir şey kaydedilmez.
 */
(function (genel) {
  "use strict";

  var GUNLER = { "pazartesi": 1, "sali": 2, "carsamba": 3, "persembe": 4, "cuma": 5, "cumartesi": 6, "pazar": 7 }; // sadeleştirilmiş adlar
  var GUN_ADI = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  var HARF = { "İ": "i", "I": "i", "ı": "i", "Ç": "c", "ç": "c", "Ğ": "g", "ğ": "g", "Ö": "o", "ö": "o", "Ş": "s", "ş": "s", "Ü": "u", "ü": "u" };
  // Hücrede TEK BAŞINA yazılan görev işaretleri (sadeleştirilmiş biçim) → "Diğer görev: <ad>" (ad ≤ 14 karakter)
  var OZEL_ISARET = { "(r)": "Rehberlik", "(o)": "Eğitici Kol", "(isl)": "İşletme Eğt.", "(y)": "Yönetim", "(p)": "Plan.Bak.Onr.", "(g)": "Sosyal Hizm." };
  var TENEFFUS_ENFAZLA_DK = 15; // bundan uzun boşluk (öğle arası) varsa iki saat birleştirilmez
  var SUTUN_TOLERANS = 19;      // hücre merkezinin başlık merkezine en çok uzaklığı (pt)

  function dk(s) { var p = s.split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function saatBicimi(s) { var p = s.split(/[:.]/); return iki(parseInt(p[0], 10)) + ":" + p[1]; }
  /** Büyük/küçük harf ve Türkçe harf farkını siler: "Çarşamba", "CARSAMBA", "(İd)" → "carsamba", "(id)". */
  function sadelestir(s) { return s.replace(/[İIıÇçĞğÖöŞşÜü]/g, function (c) { return HARF[c]; }).toLowerCase(); }

  /**
   * PDF düzenleyicileri bir yazıyı parçalara bölebilir ("14:05" → "1" + "4:05"). Aynı satırda (taban çizgisi ±1,2 pt)
   * birbirine değen (≤ 1,2 pt boşluk) parçalar tek yazıya birleştirilir. Kelime arası boşluklar daha geniştir, birleşmez.
   */
  function birlestir(ham) {
    var satirlar = [];
    sirala(ham, function (i) { return i.y * 100000 + i.x; }).forEach(function (i) {
      var l = satirlar.filter(function (k) { return Math.abs(k.y - i.y) <= 1.2; })[0];
      if (!l) { l = { y: i.y, o: [] }; satirlar.push(l); }
      l.o.push(i);
    });
    var cikti = [];
    satirlar.forEach(function (l) {
      var son = null;
      sirala(l.o, function (i) { return i.x; }).forEach(function (i) {
        var bosluk = son ? i.x - (son.x + son.w) : 0;
        // Gerçek parça bölünmesinde ("1" + "4:05") parçalardan biri çok kısadır; iki uzun yazı birbirine değiyorsa bunlar komşu
        // hücrelerin (taşan uzun şube adlarının) yazılarıdır, birleştirilmez.
        if (son && bosluk <= 1.2 && bosluk >= -1.5 && Math.min(son.w, i.w) < 14) { son.s += i.s; son.w = i.x + i.w - son.x; }
        else { son = { s: i.s, x: i.x, y: i.y, w: i.w }; cikti.push(son); }
      });
    });
    return cikti;
  }
  // Bazı PDF'lerde komşu hücrelerin yazıları (özellikle taşan uzun şube adları) pdf.js tarafından TEK parça olarak gelir
  // ("9ÇOC.G11MUH-11TAR"). Bir parça birden fazla sütun merkezini kapsıyorsa, harf genişliklerine orantılı bölünür; bölme noktası,
  // parçaların merkezleri sütun merkezlerine en yakın düşecek şekilde seçilir.
  function harfAgirligi(c) {
    if (c === " ") return 0.5;
    if (c === "." || c === "," || c === ":" || c === ";") return 0.4;
    if (c === "-") return 0.6;
    if (c === "(" || c === ")") return 0.6;
    return 1;
  }
  function bol(i, sutunlar) {
    var kapsanan = sutunlar.filter(function (s) { return s.c > i.x + 2 && s.c < i.x + i.w - 2; });
    var k = kapsanan.length, n = i.s.length;
    if (k < 2 || k > 3 || n < k) return [i];
    kapsanan = sirala(kapsanan, function (s) { return s.c; });
    var kum = [0];
    for (var a = 0; a < n; a++) kum.push(kum[a] + harfAgirligi(i.s.charAt(a)));
    var toplam = kum[n];
    function parca(bas, son) {
      var x0 = i.x + i.w * kum[bas] / toplam, x1 = i.x + i.w * kum[son] / toplam;
      return { s: i.s.slice(bas, son).trim(), x: x0, y: i.y, w: x1 - x0 };
    }
    var en = null, enMaliyet = Infinity;
    function dene(kesimler) {
      var sinirlar = [0].concat(kesimler, [n]), m = 0, p = [];
      for (var q = 0; q < k; q++) {
        var pc = parca(sinirlar[q], sinirlar[q + 1]);
        m += Math.abs(pc.x + pc.w / 2 - kapsanan[q].c);
        p.push(pc);
      }
      if (m < enMaliyet) { enMaliyet = m; en = p; }
    }
    if (k === 2) { for (var j = 1; j < n; j++) dene([j]); }
    else { for (var j1 = 1; j1 < n - 1; j1++) for (var j2 = j1 + 1; j2 < n; j2++) dene([j1, j2]); }
    return en || [i];
  }
  function iki(n) { return (n < 10 ? "0" : "") + n; }
  function merkez(i) { return i.x + i.w / 2; }
  function sirala(a, f) { return a.slice().sort(function (p, q) { return f(p) - f(q); }); }
  function medyan(a) { var s = sirala(a, function (v) { return v; }); return s[Math.floor(s.length / 2)]; }

  function enYakinSutun(sutunlar, c) {
    var en = null, fark = Infinity;
    sutunlar.forEach(function (s) {
      var f = Math.abs(s.c - c);
      if (f < fark) { fark = f; en = s; }
    });
    return fark <= SUTUN_TOLERANS ? en : null;
  }

  function ayikla(parcalar) {
    var items = birlestir(parcalar.filter(function (i) { return i.s && i.s.trim(); }).map(function (i) {
      return { s: i.s, x: i.x, y: i.y, w: i.w };
    })).map(function (i) { return { s: i.s.trim(), x: i.x, y: i.y, w: i.w }; });

    // --- sütun başlıkları (1)…(12) ---
    var baslikEtiketi = items.filter(function (i) { return /^ders\\gun$/.test(sadelestir(i.s)); })[0];
    if (!baslikEtiketi) throw new Error("Ders programı tablosu bulunamadı. e-Okul'dan alınan \"Ders Programı\" PDF'ini seçtiğinizden emin olun.");
    var sutunlar = items.filter(function (i) {
      return /^\((\d{1,2})\)$/.test(i.s) && Math.abs(i.y - baslikEtiketi.y) <= 4;
    }).map(function (i) { return { slot: parseInt(i.s.slice(1, -1), 10), c: merkez(i) }; });
    if (sutunlar.length < 5) throw new Error("Saat sütun başlıkları okunamadı.");
    var solSinir = baslikEtiketi.x + baslikEtiketi.w; // gün adlarının bulunduğu sol sütun burada biter

    // --- gün adları ve "Saat" satırları (yalnızca sol sütundaki etiketler) ---
    var gunEtiket = items.filter(function (i) { return GUNLER[sadelestir(i.s)] && i.x < solSinir; });
    var saatEtiket = items.filter(function (i) { return sadelestir(i.s) === "saat" && i.x < solSinir; });
    if (!saatEtiket.length || !gunEtiket.length) throw new Error("Gün ya da saat satırları bulunamadı.");
    gunEtiket = sirala(gunEtiket, function (i) { return i.y; });
    var farklar = [];
    for (var k = 1; k < gunEtiket.length; k++) farklar.push(gunEtiket[k].y - gunEtiket[k - 1].y);
    var H = Math.min.apply(null, farklar.length ? farklar : [37.5]); // gün satırı yüksekliği

    // --- her "Saat" satırının zilleri ---
    var zilGruplari = sirala(saatEtiket, function (i) { return i.y; }).map(function (e) {
      var slotlar = {};
      sutunlar.forEach(function (s) { slotlar[s.slot] = []; });
      items.forEach(function (i) {
        if (!/^\d{1,2}[:.]\d{2}$/.test(i.s) || Math.abs(i.y - e.y) > 12) return;
        var s = enYakinSutun(sutunlar, merkez(i));
        if (s) slotlar[s.slot].push(i);
      });
      var zil = {};
      Object.keys(slotlar).forEach(function (slot) {
        var t = sirala(slotlar[slot], function (i) { return i.y; });
        if (t.length === 2) zil[slot] = [saatBicimi(t[0].s), saatBicimi(t[1].s)];
        else if (t.length !== 0) throw new Error(slot + ". saatin başlangıç ve bitiş saati okunamadı (bulunan: " +
          t.map(function (i) { return i.s; }).join(", ") + "). PDF'te bu saatin iki saatinin de tam yazıldığından emin olun.");
      });
      return { y: e.y, zil: zil };
    });

    // --- ders kısaltması → ders adı (alt tablo: kısaltma x≈215, ad x≈240, aynı satırda) ---
    var dersAdlari = {};
    var altBaslik = items.filter(function (i) { return i.s === "Ders Adı"; })[0];
    if (altBaslik) {
      // Alt tablonun her satırı: solda ders kısaltması (x < altBaslik.x - 40), sağında bir ya da iki satırlık ders adı.
      // Satırın parçaları dikeyde birbirinden birkaç pt sapabilir (kısaltma ortada, iki satırlık ad ikiye bölünmüş);
      // bu yüzden parçalar zincirleme ≤ 6 pt yakınlıkla satırlara toplanır (satırlar arası boşluk bundan fazladır).
      var altParcalar = items.filter(function (i) {
        return i.y > altBaslik.y + 5 && i.x >= altBaslik.x - 75 && i.x < altBaslik.x + 60 && i.s !== "Toplamlar";
      });
      var altSatirlar = [];
      sirala(altParcalar, function (i) { return i.y; }).forEach(function (i) {
        var son = altSatirlar[altSatirlar.length - 1];
        if (son && i.y - son.sonY <= 6) { son.o.push(i); son.sonY = i.y; }
        else altSatirlar.push({ o: [i], sonY: i.y });
      });
      altSatirlar.forEach(function (k) {
        var kisa = k.o.filter(function (i) { return i.x < altBaslik.x - 40; });
        var ad = sirala(k.o.filter(function (i) { return i.x >= altBaslik.x - 40; }), function (i) { return i.y * 1000 + i.x; });
        if (kisa.length === 1 && ad.length >= 1) dersAdlari[kisa[0].s] = ad.map(function (i) { return i.s; }).join(" ");
      });
    }

    // --- gün satırları ---
    var zilGun = {}, hucreler = [], ozel = [], resmiToplam = {};
    var zilsiz = []; // zili olmayan saatteki özel hücreler (örn. 12. saat nöbeti): uyarıyla atlanır
    var bosSayili = []; // yalnızca (M)/(Ü) yazan, sınıf/ders adı olmayan ama PDF toplamlarına sayılan saatler
    gunEtiket.forEach(function (g) {
      var gun = GUNLER[sadelestir(g.s)];
      var grup = null;
      zilGruplari.forEach(function (z) { if (z.y < g.y) grup = z; });
      if (!grup) throw new Error(g.s + " satırından önce saat satırı yok.");
      zilGun[gun] = grup.zil;
      var ust = g.y - H / 2, alt = g.y + H / 2;
      // Gün adı sütununu dışarıda bırakmak için parçanın MERKEZİne bakılır (sol kenarına değil): uzun şube adı ("12MUH-12TAR")
      // komşu hücreye taşıp sol kenarı gün sütununa kadar uzanabilir.
      var bandda = [];
      items.filter(function (i) { return i.y >= ust && i.y < alt && merkez(i) >= solSinir; }).forEach(function (i) {
        bol(i, sutunlar).forEach(function (p) { bandda.push(p); }); // birden fazla hücrenin yazısı tek parça gelmişse ayrılır
      });
      // Ma. / Üc sütunları: tablonun sağ ucunda, sütun başlıklarının sağında
      var sonSutun = sutunlar.reduce(function (m, s) { return Math.max(m, s.c); }, 0);
      var sagdakiler = bandda.filter(function (i) { return merkez(i) > sonSutun + SUTUN_TOLERANS && /^\d+$/.test(i.s); });
      var ma = 0, uc = 0;
      if (sagdakiler.length) {
        var maX = Math.min.apply(null, sagdakiler.map(function (i) { return i.x; }));
        sagdakiler.forEach(function (i) {
          if (Math.abs(i.x - maX) < 6) ma = parseInt(i.s, 10); else uc = parseInt(i.s, 10);
        });
      }
      resmiToplam[gun] = [ma, uc];
      sutunlar.forEach(function (s) {
        var h = bandda.filter(function (i) {
          var e = enYakinSutun(sutunlar, merkez(i));
          return e && e.slot === s.slot;
        });
        if (!h.length) return;
        var satirlar = sirala(h, function (i) { return i.y; }).map(function (i) { return i.s; });
        var z = grup.zil[s.slot];
        // Hücre satırları: parantezli işaretler ("(M)", "(İŞL)") ve metin (sınıf, ders). Metnin ÜSTÜNDEKİ işaretler yalnızca etikettir
        // (örn. "(İŞL)"); hücrenin türünü metnin ALTINDAKİ (ya da metin yoksa en son) işaret belirler.
        var once = [], sonra = [], metin = [];
        satirlar.forEach(function (t) {
          var k = sadelestir(t).replace(/\s+/g, "");
          if (/^\([^()]{1,5}\)$/.test(k)) (metin.length ? sonra : once).push(k); else metin.push(t);
        });
        var tur = metin.length ? (sonra.length ? sonra[sonra.length - 1] : "") : (once.length ? once[once.length - 1] : "");
        var OZEL_TUR = { "(id)": "idari", "(d)": "hazirlik", "(n)": "nobet" };
        var ozelTur = metin.length ? "" : (OZEL_ISARET[tur] || OZEL_TUR[tur] || "");
        if (!z) {
          if (ozelTur) { zilsiz.push({ gun: gun, tur: ozelTur, slot: s.slot }); return; } // özel saat: hata verme, uyarıyla atla
          if (!metin.length && (tur === "(m)" || tur === "(u)")) return; // zili olmayan boş sayılı saat
          throw new Error(g.s + " " + s.slot + ". saat dolu ama bu saatin zili yok.");
        }
        if (!metin.length) {
          if (OZEL_ISARET[tur]) { // tek başına görev işareti: sınıf/ders adı yok → "Diğer görev: <ad>"
            ozel.push({ gun: gun, slot: s.slot, baslangic: z[0], bitis: z[1], tur: "diger", ad: OZEL_ISARET[tur] });
          } else if (OZEL_TUR[tur]) {
            ozel.push({ gun: gun, slot: s.slot, baslangic: z[0], bitis: z[1], tur: OZEL_TUR[tur] });
          } else if (tur === "(m)" || tur === "(u)") { // yalnızca (M)/(Ü): sınıf/ders yok, ama PDF toplamlarına sayılan boş saat
            bosSayili.push({ gun: gun, isaret: tur === "(m)" ? "M" : "U" });
          } else {
            throw new Error(g.s + " " + s.slot + ". saat hücresi anlaşılamadı: " + JSON.stringify(h.map(function (i) { return i.s; })));
          }
          return;
        }
        var DERS_ISARET = { "(m)": "M", "(u)": "U", "(r)": "R", "(g)": "G" }; // maaşlı, ücretli, rehberlik, öğrenci sosyal/kişilik hizmetleri (sınıf+ders adıyla birlikte)
        var dersIsareti = DERS_ISARET[tur] || "";
        // Tek metin satırı (yalnızca sınıf, örn. "mesem") ancak (M)/(Ü)/(R) işaretiyle birlikte ders saati sayılır; ders adı boş kalır.
        if (metin.length < 2 && !dersIsareti) {
          if (metin.length === 1) { // işaretsiz tek satır (örn. "SĞLK": rapor/izin saati): PDF toplamlarına sayılmayan "Diğer görev" olarak eklenir
            ozel.push({ gun: gun, slot: s.slot, baslangic: z[0], bitis: z[1], tur: "diger", ad: metin[0].slice(0, 14) });
            return;
          }
          throw new Error(g.s + " " + s.slot + ". saat hücresi anlaşılamadı: " + JSON.stringify(h.map(function (i) { return i.s; })));
        }
        var kisa = metin.length > 1 ? metin[1] : "";
        hucreler.push({ gun: gun, slot: s.slot, baslangic: z[0], bitis: z[1], sinif: metin[0], ders_kisa: kisa,
          ders: dersAdlari[kisa] || kisa, maasli: dersIsareti === "M", isaret: dersIsareti });
      });
    });

    // --- çapraz kontrol: PDF'in kendi toplamları ---
    // Uyuşmazlık HATA değil UYARIdır: PDF elle düzenlenmiş olabilir (örn. silinen hazırlık saati). Uyarılar kullanıcıya
    // gösterilir; kullanıcı programı gözle kontrol edip kaydeder.
    // İki denetim vardır: (1) HAFTALIK: alt satırdaki açıklama ("(M) Maaşlı= 15, (Ü) Ücretli= 13, (İŞL) …= 7 …") her işaret için
    // kesin sayı verir; ayıklanan saatlerle karşılaştırılır (her biçimde güvenilir). (2) GÜNLÜK: satır sonundaki "Ma." / "Üc"
    // sütunları; hangi işaretin hangi sütuna sayıldığı PDF türüne göre değiştiği için yalnızca DOĞRULANMIŞ işaretler
    // ((M)/(Ü)/(D)/(İd)/(N)/(R)) bulunan PDF'lerde denetlenir.
    var legend = null;
    items.forEach(function (i) { if (/\([^()]{1,4}\)\s*[^=()]{2,}=\s*\d/.test(i.s)) legend = i.s; }); // açıklama satırı: \"(M) Maaşlı= 15, (İŞL) …= 7\"
    var legendSayi = {}, legendSira = [];
    if (legend) {
      var lre = /\(([^()]+)\)\s*([^=,()]*?)\s*=\s*(\d+)/g, lm;
      while ((lm = lre.exec(legend)) !== null) { legendSayi[lm[1]] = parseInt(lm[3], 10); legendSira.push(lm[1]); }
    }
    var uyarilar = [];
    var ETIKET = { idari: "İdari", hazirlik: "Hazırlık", nobet: "Nöbet" };
    zilsiz.forEach(function (z) {
      return; // zili olmayan özel saatler (nöbet/hazırlık…; e-Okul 12. sütuna yazar) çok yaygındır ve programı etkilemez: uyarı yok, toplamlara yine sayılır
      uyarilar.push(GUN_ADI[z.gun] + ": " + z.slot + ". saat (" + (ETIKET[z.tur] || z.tur) + ") dolu ama bu saatin zili yok; programa eklenmedi.");
    });
    function zs(gun, tur) { return zilsiz.filter(function (z) { return z.tur === tur && (gun === null || z.gun === gun); }).length; } // atlanan özel saatler de PDF toplamlarına dahildir
    function ozelAd(gun, ad) { return ozel.filter(function (o) { return (gun === null || o.gun === gun) && o.ad === ad; }).length + zs(gun, ad); }
    function ozelTurSay(gun, tur) { return ozel.filter(function (o) { return (gun === null || o.gun === gun) && o.tur === tur; }).length + zs(gun, tur); }
    function bosSay(gun, isaret) { return bosSayili.filter(function (b) { return (gun === null || b.gun === gun) && b.isaret === isaret; }).length; }
    function dersSay(gun, f) { return hucreler.filter(function (h) { return (gun === null || h.gun === gun) && f(h); }).length; }

    // (2) günlük Ma./Üc: yalnızca doğrulanmış işaretlerde
    var EK_AD = ["Eğitici Kol", "İşletme Eğt.", "Yönetim", "Plan.Bak.Onr.", "Sosyal Hizm."];
    var gunKontrolu = !bosSayili.length && !hucreler.some(function (h) { return !h.ders_kisa; }) &&
      !ozel.some(function (o) { return o.tur === "diger" && o.ad !== "Rehberlik"; }) &&
      !zilsiz.some(function (z) { return EK_AD.indexOf(z.tur) >= 0; });
    var ucluBicim = legendSayi["Ü"] !== undefined; // (M)/(Ü)/(D)/(R)/(NB) biçimi: "Üc" ücretli+hazırlık+nöbet+rehberlik saatlerini sayar
    // PDF'in kendi tablosu açıklamasındaki nöbet sayısından azını gösteriyorsa "Üc" sütunu (nöbeti de sayar) denetlenemez.
    var nobetEksik = legendSayi["NB"] !== undefined && ozelTurSay(null, "nobet") < legendSayi["NB"];
    if (gunKontrolu) {
      Object.keys(resmiToplam).forEach(function (g) {
        var gun = parseInt(g, 10), ma = resmiToplam[g][0], uc = resmiToplam[g][1];
        var nM = dersSay(gun, function (h) { return h.maasli; });
        var nUc = dersSay(gun, function (h) { return !h.maasli; });
        var nId = ozelTurSay(gun, "idari"), nD = ozelTurSay(gun, "hazirlik"), nN = ozelTurSay(gun, "nobet"), nR = ozelAd(gun, "Rehberlik");
        var beklenenUc = nUc + (ucluBicim ? nD + nN + nR : 0);
        if (nM + nId !== ma) uyarilar.push(GUN_ADI[gun] + ": PDF'in toplam sütununda " + ma + " maaşlı/idari saat yazıyor, ayıklanan " + (nM + nId) + " saat.");
        if (!nobetEksik && beklenenUc !== uc) uyarilar.push(GUN_ADI[gun] + ": PDF'in ücretli sütununda " + uc + " saat yazıyor, ayıklanan " + beklenenUc + " saat.");
      });
    }

    // (1) haftalık: açıklama satırındaki her işaret için sayı
    var ISARET_BUL = {
      "M": ["maaşlı ders", function () { return dersSay(null, function (h) { return h.isaret === "M"; }) + bosSay(null, "M"); }],
      "Ü": ["ücretli ders", function () { return dersSay(null, function (h) { return h.isaret === "U"; }) + bosSay(null, "U"); }],
      "D": ["ders dışı hazırlık saati", function () { return ozelTurSay(null, "hazirlik"); }],
      "İd": ["idari görev saati", function () { return ozelTurSay(null, "idari"); }],
      "R": ["rehberlik saati", function () { return dersSay(null, function (h) { return h.isaret === "R"; }) + ozelAd(null, "Rehberlik"); }],
      "O": ["eğitici kol saati", function () { return ozelAd(null, "Eğitici Kol"); }],
      "NB": ["nöbet saati", function () { return ozelTurSay(null, "nobet"); }],
      "İŞL": ["işletmede mesleki eğitim saati", function () { return ozelAd(null, "İşletme Eğt."); }],
      "Y": ["yönetim saati", function () { return ozelAd(null, "Yönetim"); }],
      "P": ["planlama bakım onarım saati", function () { return ozelAd(null, "Plan.Bak.Onr."); }],
      "G": ["öğrenci sosyal ve kişilik hizmetleri saati", function () { return dersSay(null, function (h) { return h.isaret === "G"; }) + ozelAd(null, "Sosyal Hizm."); }]
    };
    var kontrolEdilen = 0;
    legendSira.forEach(function (k) {
      if (!ISARET_BUL[k]) return; // tanınmayan işaret: karşılaştırma yapılamaz
      kontrolEdilen++;
      var bulunan = ISARET_BUL[k][1]();
      // Nöbet saatleri yalnızca bilgidir (programda satır olarak gösterilmez); PDF'in kendi tablosu açıklamasıyla tutmayabilir: uyarı yok.
      if (k === "NB") return;
      if (bulunan !== legendSayi[k]) uyarilar.push("Alt satırdaki toplamda " + legendSayi[k] + " " + ISARET_BUL[k][0] + " yazıyor, ayıklanan " + bulunan + ".");
    });
    if (!kontrolEdilen) uyarilar.push("Alt satırdaki (M)/(İd)/(D) toplamları okunamadı; toplamlarla karşılaştırma yapılamadı.");

    // --- ardışık saatleri bloklara birleştir ---
    var bloklar = [];
    sirala(hucreler, function (h) { return h.gun * 100 + h.slot; }).forEach(function (h) {
      var son = bloklar[bloklar.length - 1];
      if (son && son.gun === h.gun && son.sinif === h.sinif && son.ders_kisa === h.ders_kisa &&
          dk(h.baslangic) - dk(son.bitis) <= TENEFFUS_ENFAZLA_DK) {
        son.bitis = h.bitis;
        son.saatler.push(h.slot);
      } else {
        bloklar.push({ gun: h.gun, baslangic: h.baslangic, bitis: h.bitis, sinif: h.sinif, ders: h.ders,
          ders_kisa: h.ders_kisa, saatler: [h.slot] });
      }
    });

    // --- üst bilgi ---
    function bul(re) {
      for (var n = 0; n < items.length; n++) { var m = re.exec(items[n].s); if (m) return m; }
      return null;
    }
    var ogretmen = bul(/Adı Soyadı\s*:\s*(.+)$/);
    var baslangic = bul(/Başlangıç Tarihi\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/);
    var okulOge = sirala(items.filter(function (i) { return /MTAL|Lisesi|Okulu/.test(i.s) && i.y < baslikEtiketi.y; }),
      function (i) { return i.y; })[0];

    var zilCikti = {};
    Object.keys(zilGun).map(Number).sort(function (a, b) { return a - b; }).forEach(function (g) {
      var z = {};
      Object.keys(zilGun[g]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (s) { z[s] = zilGun[g][s]; });
      zilCikti[g] = z;
    });
    function gunSlot(a, b) { return a.gun * 100 + a.slot - (b.gun * 100 + b.slot); }
    return {
      kaynak: "e-Okul ders programı PDF",
      ogretmen: ogretmen ? ogretmen[1].trim() : null,
      okul: okulOge ? okulOge.s : null,
      gecerli_baslangic: baslangic ? baslangic[3] + "-" + baslangic[2] + "-" + baslangic[1] : null,
      zil: zilCikti,
      bloklar: bloklar,
      ozel: ozel.slice().sort(gunSlot),
      uyarilar: uyarilar,
      ders_saatleri: hucreler.slice().sort(gunSlot)
    };
  }

  var cikti = { ayikla: ayikla };
  genel.Ayikla = cikti;
  if (typeof module !== "undefined" && module.exports) module.exports = cikti;
})(typeof window !== "undefined" ? window : globalThis);
