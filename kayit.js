/* iPhone sürümü: service worker kaydı + ana ekrana ekleme rehberi. Android arayüzünden bağımsızdır. */
(function () {
  "use strict";

  // Service worker (internetsiz çalışma). Kayıt başarısız olursa uygulama yine de internetle çalışır.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* sessiz: yalnızca çevrimdışı çalışma gider */ });
    });
  }

  // iPhone'da olmayan özellikler (widget; kullanıcı kararı: yedek de yok) ortak arayüz değiştirilmeden gizlenir.
  // Arayüz her çizimde #icerik'i yeniden yazar; gözlemci aynı döngüde (boyamadan önce) tekrar gizler.
  function gizle(el) { if (el.style.display !== "none") el.style.display = "none"; }
  function temizle() {
    var ic = document.getElementById("icerik");
    if (ic) {
      Array.prototype.forEach.call(ic.querySelectorAll('[data-act="yedekAl"],[data-act="yedekYukle"]'), gizle);
      Array.prototype.forEach.call(ic.querySelectorAll(".kutu"), function (k) {
        var h = k.querySelector("h2");
        if (h && h.textContent === "Widget") gizle(k);
      });
    }
    var ab = document.getElementById("altbaslik");
    if (ab && ab.textContent === "Widget ve tatil günleri") ab.textContent = "Tatil günleri";
  }
  if ("MutationObserver" in window) {
    new MutationObserver(temizle).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  temizle();

  // Depolama Safari ile ana ekran uygulaması arasında ayrıdır: veri girmeden önce ana ekrana eklenmelidir.
  function ios() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function anaEkranda() {
    return navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }
  function gecildi() {
    try { return sessionStorage.getItem("rehberGec") === "1"; } catch (e) { return false; }
  }

  var zorla = /[?&]rehber=1\b/.test(location.search); // deneme için
  if (!(zorla || (ios() && !anaEkranda() && !gecildi()))) return;

  var k = document.createElement("div");
  k.id = "rehber";
  k.innerHTML =
    "<h1>Önce ana ekrana ekleyin</h1>" +
    "<p>Programınız yalnızca ana ekrandaki uygulamada saklanır. Tarayıcıda girdiğiniz bilgiler, uygulamayı ana ekrana ekledikten sonra görünmeyebilir.</p>" +
    "<ol><li>Alttaki ya da üstteki Paylaş düğmesine dokunun.</li>" +
    "<li>“Ana Ekrana Ekle”yi seçin.</li>" +
    "<li>Ana ekrandaki “Ders Programı” simgesinden açın.</li></ol>" +
    "<button type=\"button\" id=\"rehberGec\">Yine de tarayıcıda kullan</button>";
  document.body.appendChild(k);
  document.getElementById("rehberGec").addEventListener("click", function () {
    try { sessionStorage.setItem("rehberGec", "1"); } catch (e) { /* önemsiz */ }
    k.parentNode.removeChild(k);
  });
})();
