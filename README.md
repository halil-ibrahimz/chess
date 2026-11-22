# ♟️ Düşen Taşlar — Chess.com Kariyer Analizi

[![Canlı Demo](https://img.shields.io/badge/🌐_Canlı_Demo-dusen--taslar.vercel.app-303532?style=for-the-badge)](https://dusen-taslar.vercel.app/)

Bu uygulama, bir Chess.com kullanıcısının herkese açık maç geçmişini tarar, oyunlarda yakalanan kendi taşlarını ve kariyer rekorlarını hesaplar, ardından 1080×1350 PNG kariyer posteri oluşturur. Aynı sayım çekirdeği hem Node.js CLI hem de tarayıcı (Web Worker) tarafından kullanılır.

## Web prototipini çalıştırma

Node.js 22 veya daha yenisi gerekir.

```powershell
npm install
npm run dev
```

Vite'ın terminalde gösterdiği yerel adresi tarayıcıda aç. Üretim derlemesi:

```powershell
npm run build
npm run preview
```

Web prototipinde:

- Kullanıcı adı girilerek erişilebilir tüm kariyer taranır.
- Profil, arşiv listesi ve aylık Chess.com istekleri Web Worker içinde çalışır.
  Aylık istekler kesinlikle seridir.
- PGN işleme ana arayüz iş parçacığından ayrıdır. İşlenen/toplam ay ve maç
  sayıları gerçek ilerleme olaylarından gösterilir.
- İptal düğmesi Worker'ı sonlandırır; bekleyen ağ ve hesaplama işi bırakılır.
- Tamamlanan küçük sonuç özeti aynı cihazda altı saat `localStorage` içinde
  saklanır. Ham PGN verileri saklanmaz. Kullanıcı istediğinde yeniden tarayabilir.
- Modern Web Worker ve `AbortSignal.timeout()` desteği olan bir tarayıcı gerekir.

## CLI kullanımı

```powershell
npm start -- Hiy-Z --limit 10
npm start -- Hiy-Z --all
```

`--limit` verilmezse son 10 oyun işlenir. `--all`, tüm erişilebilir arşiv
aylarını eskiden yeniye ve tek tek işler; `--all` ile `--limit` aynı anda
kullanılamaz. Uzun kariyerlerde indirme ve PGN oynatma zaman alabilir.

CLI ilerleme olaylarını tek satırlık JSON olarak `stderr` akışına, nihai
pretty-printed JSON sonucunu yalnızca `stdout` akışına yazar. Bu ayrım başka
uygulamaların final sonucu güvenle ayrıştırmasını sağlar.

Chess.com, otomasyon istemcilerinde iletişim bilgisi içeren tanınabilir bir
`User-Agent` önerir. Node CLI bunu destekler:

```powershell
$env:CHESS_COM_CONTACT="iletisim@example.com"
npm start -- Hiy-Z --all
```

Tarayıcı JavaScript'i özel `User-Agent` başlığı ayarlayamadığı için web
istemcisi tarayıcının doğal başlığını kullanır ve yalnız `Accept:
application/json` gönderir.

## Ortak çalışma yapısı

- `src/lost-pieces.js`: PGN'yi `chess.js` ile oynatır; renk ve kayıp taş
  sayımının tek kaynağıdır.
- `src/history-scanner.js`: arşiv aylarını sıralı işler, tekrarları engeller,
  ortak ilerleme olaylarını ve sonucu üretir.
- `src/chess-com-client.js`: Chess.com istekleri, doğrulama, zaman aşımı ve
  güvenli yeniden deneme davranışını içerir. Tarayıcıdaki native `fetch`, doğru
  `WorkerGlobalScope` alıcısına bağlı tutulur; testlerde enjekte edilen istemciler
  bundan etkilenmez.
- `src/web/history.worker.js`: aynı istemci ve tarayıcıdan bağımsız tarama
  çekirdeğini Web Worker içinde çalıştırır; sayım algoritmasını kopyalamaz.
- `src/App.jsx`: form, ilerleme, iptal, kısa süreli sonuç önbelleği ve sade
  sonuç ekranını yönetir.

Oyun kimliği için UUID, oyun URL'si ve SHA-256 içerik parmak izi birlikte
kullanılır. Sonraki kayıtta bunlardan biri eşleşirse aynı maç yeniden sayılmaz.
SHA-256, Web Crypto varsa onunla; yerel ağ HTTP ortamında yoksa aynı çıktıyı
üreten bağımlılıksız JavaScript yedeğiyle hesaplanır.

## Sayım kapsamı ve varsayımlar

- Yalnızca `rules=chess` olan tamamlanmış standart oyunlar sayılır. Daily,
  Rapid, Blitz ve Bullet ile rated/unrated oyunlar aynı kurala tabidir.
- Renk, Chess.com'un `white.username` / `black.username` alanlarından
  belirlenir.
- Geçerken alınan piyon normal piyon kaybıdır.
- Terfi eden taş daha sonra yakalanırsa yakalandığı türle sayılır; bu nedenle
  vezir kaybı başlangıçtaki vezir sayısını aşabilir.
- Terk, süre bitimi veya mat, tahtada duran taşları ek kayıp yapmaz. Şah
  sayılmaz.
- Bozuk/eksik PGN, çözülemeyen renk, desteklenmeyen varyant veya Chess.com son
  FEN'iyle uyuşmayan kayıt tümüyle atlanır; kısmi sonuç eklenmez.
- Chess.com önbelleği nedeniyle en yeni oyun hemen görünmeyebilir.
- `429`, `408`, geçici `5xx`, bağlantı ve zaman aşımı hataları en fazla
  dört toplam denemeyle, `Retry-After` başlığına uyan üstel beklemeyle
  yeniden denenir.

Geliştirme sırasında oluşan istek hataları aşama, URL, varsa HTTP durumu ve
özgün neden (`cause`) bilgisiyle kaydedilir. Kullanıcıya gösterilen hata metni de
profil, arşiv listesi veya aylık arşiv aşamasına göre ayrılır; geliştirici
ayrıntıları kullanıcı ekranına dökülmez.

## Doğrulama durumu — 6 Ağustos 2026

Playwright'ın kendi Chromium 151 tarayıcısında gerçek
`http://127.0.0.1` kökeninden Chess.com profil, arşiv listesi ve son aylık
arşiv uç noktalarına seri `fetch` gönderildi. Üç yanıt da HTTP 200 ve
`response.type === "cors"` verdi; Hiy-Z için 23 arşiv ayı bulundu.

Web uygulaması üretim için başarıyla paketlendi; React arayüzü ve gerçek Worker
dosyası Chromium'da yüklendi. İlk Worker denemesindeki belirsiz görünen ağ
hatasının kesin nedeni bulundu: istemci `globalThis.fetch` referansını bir nesne
özelliğinde tutup `this.fetchImpl(...)` biçiminde çağırdığı için Chrome native
`fetch` fonksiyonunu `WorkerGlobalScope` yerine istemci nesnesi alıcısıyla
çalıştırmaya uğraşıyordu. Sonuç, ilk profil URL'sinde henüz bir HTTP yanıtı
oluşmadan `TypeError: Illegal invocation` idi. Bu nedenle istek ağ gözleminde
görünmüyor ve genel bağlantı hatası gibi raporlanıyordu.

Native `fetch` doğru `WorkerGlobalScope` alıcısına bağlandı. Sorun CORS,
`User-Agent`/`Accept` başlıkları, Vite Worker paketi veya `AbortSignal` desteği
değildi. Düzeltme yalnız ağ çağrısının bağlamını değiştirir; profil, arşiv
listesi ve seri ay-ay indirme ile PGN işleme Worker içinde kalır. Ağ veya PGN
işini ana arayüz iş parçacığına taşıma koşulu oluşmamıştır.

Kurulu sistem Chrome'unun sayfaya gitmeden `0x80000003` ile çökmesi ayrı bir test
tarayıcısı olayıydı. Düzeltmeden sonra sistem Chrome'u tekrar tekrar başlatılmadı;
Playwright'ın paketli Chromium 151 sürümüyle, 390 × 844 mobil görünüm alanında tek
bir kontrollü Hiy-Z tam taraması başarıyla tamamlandı.

6 Ağustos 2026 canlı ölçümünde Chess.com artık 23 ayda 5.107 maç döndürdü; önceki
5.106 maçlık ölçümden sonra hesaba bir oyun daha eklenmişti. Tarama duvar saatiyle
38,03 saniye, uygulama ölçümüne göre 37,97 saniye sürdü. Aylık isteklerde en yüksek
eşzamanlılık 1 kaldı; retry, başarısız istek, console hatası veya sayfa hatası
oluşmadı. Ana iş parçacığındaki en uzun ölçülen gecikme 13,2 ms idi; arayüzün
donduğuna dair işaret görülmedi. Ana sayfanın ölçülebilen JS heap değişimi yaklaşık
+0,28 MiB oldu, ancak Chromium Worker heap kullanımını raporlamadığı için toplam
tarayıcı bellek tepesi doğrulanamadı. Mobil boyut ve ana iş parçacığı davranışı iyi
görünse de bu koşu gerçek bir mobil cihazın işlemci/bellek sınırlarını ölçmez.

Canlı sonuçta 5.107 maçın tamamı işlendi, kayıt atlanmadı ve tekrar bulunmadı.
Kaybedilen taşlar: toplam 37.910; piyon 16.097, at 8.056, fil 6.908, kale 4.405,
vezir 2.444.

## Bağımsız taş-korunumu denetimi — 6 Ağustos 2026

Üretim sayacı ve web arayüzü değiştirilmeden ikinci bir audit yöntemi eklendi.
Bu yöntem `move.captured` veya üretim sayacını kullanmaz. Başlangıç ve Chess.com
final FEN envanterlerini sayar; kullanıcının kendi hamlesi öncesi/sonrası tahta
envanterinden terfileri bulur. Piyon kaybı `başlangıç - terfi - final`, diğer taş
türleri ise `başlangıç + o türe terfi - final` formülüyle hesaplanır. Şah dışarıda
kalır.

```powershell
npm run audit:history -- Hiy-Z --output audit/reports/hiy-z-audit.json
```

Canlı denetim sırasında hesap iki yeni oyunla 5.109 maça çıktı. 23 ayın tamamında
5.109 maçın 5.109'unda yöntemler eşleşti; uyuşmazlık, denetlenemeyen kayıt, tekrar
ve kimlik çakışması yoktu. İki yöntem de toplam 37.923; piyon 16.103, at 8.058,
fil 6.911, kale 4.407 ve vezir 2.444 buldu.

Önceki 5.107 maçlık 37.910 sonucu da doğrulandı: sonradan eklenen iki oyunun
birleşik kaybı tam olarak toplam 13; piyon 6, at 2, fil 3, kale 2, vezir 0 idi.
Bu fark güncel toplamdan çıkarıldığında önceki dağılım birebir elde ediliyor.

- [Tam canlı audit raporu](audit/reports/hiy-z-conservation-audit-2026-08-06.json)
- [Önceki 5.107 maçlık anlık görüntü fark kontrolü](audit/reports/hiy-z-previous-snapshot-check-2026-08-06.json)

Tam raporda `satranc-mezarligi-conservation-audit-v1` sabit tohumu ve
`archive-strata-seeded-v1` yöntemiyle 20 farklı arşiv döneminden seçilmiş gerçek
maçların URL, tarih, kullanıcı rengi ve kayıp dağılımları bulunur. Aynı sabit veri
kümesinde örnek tekrar üretilebilir; hesap geçmişi değişirse sabitlenmiş JSON
manifesti eski kontrol kümesini korur. İki sayım yöntemi aynı `chess.js` PGN
ayrıştırıcısını kullandığı için ortak bir ayrıştırıcı hatası bu denetimin açık
sınırıdır.

## Test ve güvenlik

```powershell
npm test
npm run build
npm audit
```

Gerçek CORS probunu ayrı çalıştırmak için önce Playwright Chromium'u kur:

```powershell
npx playwright install chromium
npm run test:browser:cors -- Hiy-Z
npm run test:browser:live -- Hiy-Z
```

`test:browser:live`, Playwright'ın paketli Chromium'unu yalnız bir kez başlatır;
sekiz dakika içinde tamamlanmazsa otomatik olarak yeniden denemez.

## Resmî veri kaynakları

- [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api)
- [Chess.com PubAPI yardım sayfası](https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it)

Kullanılan uç noktalar:

- `GET /pub/player/{username}`
- `GET /pub/player/{username}/games/archives`
- `GET /pub/player/{username}/games/{YYYY}/{MM}`
