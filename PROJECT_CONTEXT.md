# Düşen Taşlar — Proje Bağlamı

**Son güncelleme:** 15 Ağustos 2026

## 1. Projenin kısa özeti

**Düşen Taşlar**, bir Chess.com kullanıcısının herkese açık maç geçmişini tarayıp kendi ordusundan oyunlar boyunca kaç piyon, at, fil, kale ve vezir kaybettiğini hesaplayan, tarayıcı öncelikli bir web uygulamasıdır. Sonuçları yalnız rakamsal bir tablo olarak bırakmaz; oyuncunun satranç kariyerini eğlenceli ve saygılı bir “kariyer arşivi” olarak sunar. Kullanıcı ayrıca gerçek sonucundan üretilen 1080×1350 piksel ölçüsünde bir kariyer posterini PNG olarak indirebilir.

Projenin aynı sayım çekirdeğini kullanan bir Node.js komut satırı aracı da vardır. Web uygulamasında hesaplama ve Chess.com istekleri kullanıcının tarayıcısında yürür; projeye ait bir backend, veri tabanı veya kullanıcı hesabı sistemi yoktur.

## 2. Projenin ortaya çıkış amacı ve çözmeye çalıştığı ihtiyaç

Başlangıç fikri “Satranç Mezarlığı” idi: oyuncunun yıllar içinde kaybettiği taşların büyüklüğünü görünür ve kişisel bir deneyime dönüştürmek. Teknik prototip, önce bu fikrin gerçekten hesaplanabilir olup olmadığını doğrulamak için geliştirildi. Daha sonra ürünün adı ve duygusu **Düşen Taşlar** olarak şekillendi.

Chess.com normalde maçları ve tek tek oyun sonuçlarını gösterir; ancak bir oyuncunun bütün kariyeri boyunca kendi taşlarından kaçını kaybettiğini topluca anlatmaz. Bu proje o dağınık geçmişi tek bir kariyer kaydına dönüştürür. Amaç motor analizi yapmak, oyuncuya ders vermek veya hamle kalitesini puanlamak değildir. Amaç, uzun bir satranç geçmişine farklı, karakterli ve paylaşılabilir bir açıdan bakmaktır.

## 3. Hedef kullanıcı ve temel kullanıcı akışı

Hedef kullanıcı, Chess.com’da herkese açık maç geçmişi bulunan ve kariyerinin eğlenceli bir özetini görmek isteyen satranç oyuncusudur. Teknik bilgi veya üyelik gerektirilmez.

Temel web akışı şöyledir:

1. Kullanıcı Chess.com kullanıcı adını forma yazar.
2. Uygulama önce aynı kullanıcı için son altı saatte bu cihazda tamamlanmış geçerli bir sonuç olup olmadığını kontrol eder.
3. Geçerli önbellek yoksa bir Web Worker başlatılır ve Chess.com profili ile arşiv listesi alınır.
4. Arşiv ayları eskiden yeniye, kesinlikle seri biçimde indirilir ve işlenir.
5. Ekranda işlenen/toplam ay, işlenen maç ve gerekiyorsa güvenli yeniden deneme bilgisi gösterilir. Kullanıcı taramayı iptal edebilir.
6. Tarama tamamlanınca giriş formu gizlenir; sonuç ekranı açılır.
7. Kullanıcı taş kayıplarını, kariyer kayıtlarını ve isteğe bağlı teknik ayrıntıları görür.
8. “Kariyer kartını hazırla” ile mevcut sonuçtan poster ön izlemesi açabilir ve PNG indirebilir.
9. “Geri dön” forma döner ve yazılan kullanıcı adını korur. “Yeniden tara” önbelleği kullanmadan yeni tarama başlatır.

Web arayüzü her zaman erişilebilir tüm geçmişi tarar. Son N maç seçeneği yalnız komut satırı aracında vardır.

## 4. Şu anda çalışan özellikler

- Chess.com kullanıcı adı doğrulama ve kullanıcının forma yazdığı büyük/küçük harf biçimini sonuçta koruma.
- Kullanıcının erişilebilir bütün arşiv aylarını seri biçimde tarama.
- Gerçek ay ve maç ilerlemesi, yeniden deneme durumu ve işlemi iptal etme.
- Standart maçların PGN kayıtlarını yeniden oynatarak piyon, at, fil, kale ve vezir kayıplarını sayma.
- Aynı maçın UUID, URL veya içerik parmak izi üzerinden ikinci kez sayılmasını önleme.
- Toplam maç, incelenen/atlanan kayıt, toplam kayıp ve taş türü dağılımını gösterme.
- Üç seçili kariyer kaydı: en kanlı zafer, en uzun savaş ve en hızlı mat.
- Vezir kaybıyla kazanılan maç ve kayıpsız kazanılan maç sayaçları.
- Eski önbellekte kariyer kayıtları yoksa uygulamayı çökertmeden yeniden tarama önerme.
- Sonucu bu cihazda altı saat saklama; kullanıcı isterse yeniden tarayabilir.
- Aşamaya göre anlaşılır hata mesajları; geliştirme ortamında URL, HTTP durumu ve özgün hata nedeni gibi teknik ayrıntılar.
- Mobil öncelikli, erişilebilir sonuç arayüzü; klavye odağı, anlamlı alternatif metinler ve azaltılmış hareket tercihi desteği.
- Dinamik, responsive ön izlemeli, tam 1080×1350 piksel kariyer posteri ve tarayıcı içinde PNG indirme.
- `--limit` ve `--all` modlarına sahip Node.js CLI. İlerleme `stderr`, nihai JSON `stdout` üzerinden verilir.
- Üretim sayacından ayrı taş-korunumu denetimi, sabit tohumlu gerçek maç örneği ve tarihli denetim raporları. Bu denetim son kullanıcı özelliği değil, doğruluk aracıdır.
- Node testleri, Vite production build’i ve Playwright Chromium ile CORS, canlı tarama, sonuç ekranı ve poster kontrolleri için komutlar.
- Proje görsellerinden bağlanan favicon.

## 5. Chess.com’dan verilerin nasıl alındığı ve işlendiği

Uygulama, Chess.com’un herkese açık Published-Data API’sini (PubAPI) kullanır. Üç veri adımı vardır:

- Oyuncu profili: yazılan adın varlığını ve Chess.com’un döndürdüğü kanonik kullanıcı adını almak için.
- Arşiv listesi: hesabın hangi yıl/ay arşivlerine sahip olduğunu öğrenmek için.
- Aylık maç arşivi: ilgili ayın oyun, PGN, final FEN, oyuncu, sonuç ve zaman bilgilerini almak için.

Web uygulamasında hem ağ istekleri hem PGN işleme Web Worker içinde çalışır. Böylece ana React arayüzü ağır maç hesaplamasıyla mümkün olduğunca az meşgul olur. Worker, tarayıcıdan bağımsız ortak tarama ve sayım modüllerini çağırır; algoritmanın tarayıcı için ayrı bir kopyası yoktur.

Arşiv URL’leri ay bazında tekilleştirilir, kronolojik olarak sıralanır ve `await` edilen bir döngüyle birer birer işlenir. Aylık istekler paralel gönderilmez. Her ayın oyun dizisi o ay geldiğinde işlenir; bütün kariyerin ham PGN kayıtları tek bir listede biriktirilmez. Buna karşılık tekrar engellemek için görülen maç kimlikleri tarama boyunca bellekte tutulur.

Her oyun için mümkün olan üç kimlik üretilir: Chess.com UUID’si, normalleştirilmiş oyun URL’si ve oyun zamanı, oyuncular, PGN ile FEN’den oluşturulan SHA-256 içerik parmak izi. Bunlardan herhangi biri daha önce görülmüşse kayıt tekrar kabul edilir ve ikinci kez sayılmaz. SHA-256 burada güvenlik veya kimlik doğrulama için değil, kararlı tekrar tespiti için kullanılır. Güvenli bağlamlarda Web Crypto kullanılır; yerel ağdaki HTTP gibi `crypto.subtle` bulunmayan ortamlarda aynı küçük harfli hex sonucu veren bağımlılıksız JavaScript yedeği vardır.

İstek zaman aşımı varsayılan olarak 15 saniyedir. HTTP 408, 429 ve geçici 5xx yanıtları ile bağlantı/zaman aşımı ve geçici gövde okuma hataları yeniden denenebilir. Varsayılan ayar ilk istek dâhil en fazla dört toplam denemedir. Bekleme üstel artar, küçük bir rastgele gecikme eklenir ve varsa `Retry-After` başlığına uyulur; 429 için taban bekleme en az beş saniyedir. Bir arşiv ayı bütün denemelere rağmen alınamazsa sonraki aylara geçilip eksik bir final üretilmez; tarama hata ile durur.

Tarayıcı özel `User-Agent` başlığı ayarlayamadığından doğal tarayıcı başlığını ve `Accept: application/json` kullanır. Node CLI ise isteğe bağlı `CHESS_COM_CONTACT` bilgisiyle tanınabilir bir `User-Agent` gönderebilir.

## 6. Taş kayıplarının nasıl hesaplandığı

Üretimdeki tek sayım kaynağı, oyunun PGN’sini `chess.js` ile yeniden oynatan ortak analiz modülüdür. Önce maçın standart satranç olup olmadığı, PGN’nin tamamlanmış bir sonuç içerip içermediği ve yeniden oynatılan son konumun Chess.com’un verdiği final FEN ile eşleşip eşleşmediği kontrol edilir. Sonra hamle geçmişindeki gerçek alma olayları incelenir.

### Kullanıcının rengi

Kullanıcının yazdığı ad, Chess.com’un kanonik kullanıcı adı ve profil URL’si; oyundaki beyaz ve siyah taraflarla karşılaştırılır. Yalnızca bir taraf kesin biçimde eşleşirse renk belirlenir. İki tarafın da eşleşmesi veya hiçbir tarafın eşleşmemesi durumunda maç güvenilir sayılamaz ve atlanır.

Kullanıcı beyazsa siyahın, kullanıcı siyahsa beyazın yaptığı alma hamleleri içinden kullanıcının taşları sayılır. Kullanıcının rakipten aldığı taşlar bu projenin konusu değildir.

### Terfi eden taşlar

Bir taş yakalandığı andaki türüyle sayılır. Piyon terfi ettiği anda kayıp sayılmaz; tahtada başka bir taşa dönüşmüş olur. Örneğin terfi etmiş bir vezir daha sonra alınırsa kayıp “vezir” hanesine yazılır. Bu nedenle bir kariyerdeki vezir kaybı, başlangıçta her oyunda bulunan tek vezir varsayımının üstüne çıkabilir.

### Geçerken alma

`chess.js`, geçerken alma hamlesini yakalanan piyon bilgisiyle verir. Bu olay normal bir piyon kaybı olarak sayılır. Eski Chess.com FEN kayıtlarında fiilen alma mümkün olmasa bile yazılmış en-passant hedefleri bulunabildiği için FEN karşılaştırması kurallı konuma normalleştirilir; gerçek tahta farkları korunur.

### Şahın neden sayılmadığı

Satrançta şah fiilen tahtadan alınmaz; oyun mat, terk, süre veya başka bir sonuçla daha önce biter. Projenin kayıp tanımı yalnız gerçekleşmiş alma hamleleridir. Bu nedenle şah toplam kayba hiçbir zaman eklenmez. Sonuç ekranındaki “Şah — 0 kayıp” bölümü bilinçli ve mizahi bir arayüz unsurudur; algoritmanın parçası değildir.

### Atlanan varyantlar veya bozuk maçlar

Yalnız `rules=chess` olan tamamlanmış standart oyunlar analiz edilir. Daily, Rapid, Blitz ve Bullet gibi zaman sınıfları; rated veya unrated oluşundan bağımsız olarak aynı sayım kuralını kullanır. Chess960 ve diğer standart dışı varyantlar atlanır.

Eksik veya ayrıştırılamayan PGN, bitmemiş `*` sonucu, çözülemeyen kullanıcı rengi, geçersiz FEN, Chess.com final FEN’iyle uyuşmayan yeniden oynatma veya taş envanteri tutarsızlığı bulunan maç bütünüyle atlanır. Maçtan kısmi kayıp eklenmez ve kariyer kayıtlarına da girmez. Terk, süre bitimi veya mat, yalnız tahtada duran taşları kayıp saydırmaz; sadece o ana kadar gerçekten gerçekleşen almalar hesaba katılır.

Üretim sayacı ayrıca toplam alma sayısının başlangıç ve finaldeki şah dışı taş envanteri farkıyla uyumlu olmasını ister. Geliştirme denetiminde ikinci bir yöntem, `move.captured` kullanmadan başlangıç konumu, özel FEN, gerçekleşen terfiler ve final tahta envanterinden kayıpları hesaplar. Tarihli Hiy-Z denetiminde iki yöntem aynı maç kümesinde eşleşmiştir. Bununla birlikte iki yöntem de PGN’yi `chess.js` ile ayrıştırdığı için ortak bir ayrıştırıcı hatası bağımsız denetimin bilinen sınırıdır.

## 7. Kariyer kayıtlarının anlamı

Kayıtlar, zaten başarıyla analiz edilmiş maçın sayım sonucundan aynı geçiş sırasında üretilir. PGN ikinci kez işlenmez ve bütün maçlar kayıt seçimi için bellekte tutulmaz.

### En kanlı zafer

Kullanıcının kazandığı maçlar arasında kendi taşlarından en fazla kaybettiği maçtır. Şah dışarıdadır; terfi ve taş türü kuralları normal sayaçla aynıdır. Eşit kayıp sayısında bitiş zamanı daha yeni maç seçilir; o da eşitse URL, UUID veya kararlı yedek kimlik sırası kullanılır.

### En uzun savaş

Başarıyla incelenen bütün maçlar arasında en yüksek yarım hamle (`plyCount`) sayısına sahip maçtır. Kazanma şartı yoktur; sonuç galibiyet, yenilgi veya beraberlik olabilir. Kullanıcıya gösterilen tam hamle sayısı `plyCount / 2` değerinin yukarı yuvarlanmasıdır. Eşitlik kuralı önce en yeni bitiş zamanı, sonra kararlı maç kimliğidir.

### En hızlı mat

Yalnız kullanıcının kazandığı ve rakibin Chess.com ham sonuç değerinin tam olarak `checkmated` olduğu maçlar arasından en düşük `plyCount` seçilir. Timeout, terk, abandoned veya başka biçimde biten galibiyetler kabul edilmez; kullanıcının mat olduğu yenilgi de aday değildir. Eşitlikte önce en yeni maç, sonra kararlı kimlik sırası uygulanır.

Seçilen üç kayıtta mümkün olduğunda oyun URL’si, rakip adı ve rating’i, kullanıcının rengi, bitiş zamanı, time class, time control, ham sonuçlar, `plyCount`, kullanıcıya gösterilecek hamle sayısı ve o oyundaki kayıp dağılımı saklanır. Uygun maç yoksa kayıt `null` olur. Ayrıca vezir kaybetmesine rağmen kazanılan maçlar ile hiçbir taş kaybetmeden kazanılan maçlar akış sırasında sayılır.

## 8. Sonuç ekranı ve indirilebilir kariyer posteri

Sonuç ekranı tarama bittiğinde giriş ekranının yerini alır. Üstte “Geri dön” ve “Yeniden tara” kontrolleri, kullanıcının yazım biçimini koruyan adı, toplam maç ve toplam kayıp bulunur. Şah için ayrı mizahi alan; piyon için büyük koyu kart; at, fil, kale ve vezir için responsive kartlar vardır. Koyu özet ve piyon alanlarında çok soluk CSS satranç tahtası filigranları kullanılır.

“Unutulmayan üç savaş” bölümü üç kariyer kaydını gerçek kullanıcı verisinden gösterir. Güvenli Chess.com oyun URL’si varsa yeni sekmede açılan bağlantı sunulur. Altında “Vezir kaybıyla zafer” ve “Kayıpsız zafer” sayaçları bulunur. Arşivci Fil kartı yöntemi sade dille açıklar. “Teknik ayrıntılar” başlangıçta kapalıdır; incelenen/atlanan maç, arşiv ayı, süre, ana iş parçacığı gecikmesi ve ortam destekliyorsa yaklaşık bellek değişimini gösterir.

Kariyer posteri sonuç ekranındaki mevcut veriyi kullanır; yeni tarama veya ek API isteği başlatmaz. Responsive modal içinde küçültülmüş görünse de iç tuvali daima 1080×1350 piksel ve 4:5 oranındadır. Posterde kullanıcı adı, tarama tarihi, toplamlar, beş taşın kaybı ve üç kariyer kaydı dinamik gösterilir. Uzun kullanıcı adı ve uzun kayıt değerleri alana sığacak kadar otomatik küçülür; eksik kayıt “Kayıt bulunamadı” olarak kalır.

PNG üretimi tamamen tarayıcıda yapılır. Önce `document.fonts.ready` ve posterdeki yerel WebP görsellerinin yüklenmesi beklenir. Poster DOM’u `modern-screenshot` ile PNG Blob’a çevrilir ve çıktı boyutu indirmeden önce gerçekten 1080×1350 olarak doğrulanır. Dosya adı kullanıcı adından güvenli biçimde `dusen-taslar-...png` şeklinde üretilir. Geçici bağlantı öğeleri ve object URL’leri işlem sonunda temizlenir. Poster üzerinde henüz site adresi, QR kodu veya “resmî ürün” izlenimi yaratacak unsur yoktur; “Resmî Chess.com ürünü değildir.” ifadesi korunur.

## 9. Kullanılan teknolojiler ve görevleri

- **JavaScript (ES modülleri):** Projenin ana programlama dilidir. Aynı iş mantığının tarayıcı ve Node.js tarafından kullanılmasını kolaylaştırır; ayrı backend dili gerektirmez.
- **React:** Form, tarama durumu, ilerleme, sonuç ekranı, modal ve erişilebilir etkileşimleri oluşturan arayüz kütüphanesidir. Bileşen tabanlı yapı, görsel bölümleri veri işleme çekirdeğinden ayırır.
- **Vite:** Geliştirme sunucusu ve production paketleyicisidir. React ile Web Worker modülünü ve kökteki yerel görselleri birlikte işler; sade ve hızlı bir statik web yapısı sağlar.
- **Chess.com PubAPI ve Fetch:** Herkese açık profil, arşiv listesi ve aylık maç verilerinin kaynağıdır. Ayrı bir veri sağlayıcısı veya uygulama backend’i gerektirmez.
- **PGN ve FEN:** PGN gerçekleşen hamle geçmişini, FEN ise tahta konumunu temsil eden satranç veri formatlarıdır. Sayım PGN’den yapılır; final FEN doğruluk kontrolü olarak kullanılır.
- **chess.js:** PGN’yi kurallara uygun biçimde yeniden oynatan satranç kütüphanesidir. Normal alma, geçerken alma, terfi ve özel başlangıç FEN’i gibi ayrıntıları elle yeniden uygulama riskini azaltır.
- **Web Worker:** Ağ ve ağır PGN işlemesini ana arayüz iş parçacığından ayıran tarayıcı özelliğidir. İlerleme ve final sonuçları yapılandırılmış mesajlarla React uygulamasına döner.
- **localStorage:** Tamamlanan küçük sonuç nesnesini aynı cihazda altı saat saklar. Ham aylık cevaplar ve PGN arşivi saklanmaz. Kullanıcı hesabı veya sunucu veri tabanı yerine düşük maliyetli kısa süreli kolaylık sağlar.
- **Web Crypto ve JavaScript SHA-256 yedeği:** Maç tekrarlarını engelleyen içerik parmak izini üretir. Kullanım amacı güvenlik değil kimlik kararlılığıdır; yerel ağ HTTP ortamlarında da taramanın devam etmesi için eşdeğer yedek vardır.
- **modern-screenshot:** Poster DOM’unu istemci tarafında PNG’ye dönüştüren küçük kütüphanedir. Harici görsel servisi veya sunucu gerektirmeden sabit ölçülü çıktı sağlar.
- **HTML ve CSS:** Responsive düzen, sıcak kâğıt görünümü, satranç filigranları, klavye odağı ve azaltılmış hareket davranışını sağlar. Yeni bir UI framework’ü kullanılmaz.
- **Node.js:** CLI aracını, otomatik testleri, denetim komutlarını ve Vite geliştirme araçlarını çalıştırır. Proje `package.json` içinde Node 22 veya üstünü ister.
- **Node test runner:** Sayım, istemci, retry, tekrar engelleme, Worker protokolü, cache, kariyer kayıtları ve SHA-256 davranışlarını bağımlılıksız test eder.
- **Playwright Chromium:** Gerçek tarayıcıda CORS, Worker, responsive arayüz, görsel yükleme, konsol hataları, poster ve gerçek PNG boyutunu kontrol eder. Canlı tarama testi ayrı ve açıkça çağrılan bir komuttur.
- **WebP ve ICO varlıkları:** Satranç karakterlerini şeffaf, görece küçük dosyalarla sunar; ICO site faviconudur. Görseller çalışma zamanında üretilmez.

Projede TypeScript, CSS framework’ü, backend framework’ü, bulut veri tabanı veya analiz SDK’sı yoktur.

## 10. Tasarım dili, renk paleti, karakterler ve isim

Tasarımın ana duygusu kasvetli bir mezarlık değil, uzun süre mücadele etmiş bir ordunun kariyerini onurlandıran sıcak ve hafif mizahi bir arşivdir. “Düşen Taşlar” adı hem tahtada gerçekten alınan taşları anlatır hem de oyuncunun geçmişindeki küçük fedakârlıklara karakter kazandırır. Kayıp fikri vardır; ancak ölüm, yas ve karanlık korku estetiği baskın değildir.

Ana renkler kömür siyahı/koyu yeşil `#303532`, sıcak kâğıt kremi `#f5ebd6`, daha açık krem `#fff8e8`, adaçayı `#a9b196` ve tonlarıdır. İnce sıcak kahverengi `#b06c2e`, odak çizgisi ve küçük vurgu olarak kullanılır. Başlıklarda editoryal bir serif görünümü için Georgia/Times ailesi; küçük etiketler ve arayüz kontrollerinde sistem sans-serif yazı ailesi vardır.

Şeffaf WebP karakterler şunlardır: piyon, at, fil, kale, vezir ve şah; ayrıca kayıtlar için zafer piyonunun, uzun savaş kalesinin ve hızlı mat atının özel illüstrasyonları bulunur. Arşivci Fil, hem girişte rehber karakter hem sonuçta yöntemi açıklayan arşiv görevlisidir. Tarama sırasında Arşiv Kuryesi atı ilerleme çizgisinde hareket eder. `prefers-reduced-motion` seçeneğinde bu hareket kapatılır. Şahın “Sen kaybetsen de o düşmez.” cümlesi ve taşlara verilen kısa karakter metinleri ürünün mizahını taşır.

Poster de aynı dili sürdürür: sıcak kâğıt, az sayıda güçlü alan, kontrollü asimetri, düz satranç filigranları ve gerçek karakter görselleri. Uzun sonuç sayfasının ekran görüntüsü veya yoğun kartlardan oluşan bir infografik değildir.

## 11. Gizlilik, maliyet ve cihazda işleme

Web sürümünde tarama Chess.com ile doğrudan kullanıcının tarayıcısı arasında gerçekleşir. Ham PGN verileri projeye ait bir sunucuya gönderilmez; çünkü şu anda böyle bir sunucu yoktur. İşleme Worker içinde kullanıcının cihazında yapılır.

Tamamlanan özet sonuç, tarama tarihi ve seçilmiş kariyer kayıtları altı saat süreyle aynı tarayıcının `localStorage` alanında tutulur. Ham maç arşivi saklanmaz. Önbellek kullanılamaz veya doluysa tarama yine çalışabilir; saklama yalnız kolaylık özelliğidir. PNG de cihazda üretilip doğrudan kullanıcıya indirilir.

Uygulamada üyelik, giriş, çerez tabanlı takip, reklam, ödeme veya analiz servisi bulunmaz. Mevcut mimarinin çalışma zamanı için uygulamaya ait backend ya da veri tabanı maliyeti yoktur. Ancak halka açık bir alan adına production dağıtım yapılmış değildir; gelecekte seçilecek statik barındırmanın fiyatı ve sınırları ayrı karardır. Chess.com API erişiminin koşulları ve sınırları da uygulamanın kontrolünde değildir.

## 12. Bilerek eklenmeyenler ve önemli ürün kararları

- Stockfish değerlendirmesi, hamle doğruluğu, blunder analizi veya oyun tavsiyesi yoktur.
- Yapay zekâ tarafından üretilen maç yorumu, taş konuşmaları veya kişisel metinler yoktur.
- Üyelik, giriş, profil yönetimi, sunucu veri tabanı ve kullanıcı geçmişi hesabı yoktur.
- Backend proxy, sunucu kuyruğu veya paylaşımlı sunucu önbelleği yoktur.
- Ücretli altyapı veya ücretli harici görsel servisi yoktur.
- Paylaşma düğmesi, QR kod, kesinleşmemiş site adresi veya sosyal ağ entegrasyonu yoktur. Yalnız yerel PNG indirme vardır.
- Web arayüzünde kullanıcı tarafından seçilen keyfî bir maç sınırı yoktur; amaç bütün erişilebilir kariyeri taramaktır. Bir sınır gerekiyorsa gerçek performans ve API ölçümlerine dayanarak ürün sahibiyle kararlaştırılmalıdır.
- Şah veri toplamına eklenmez; yalnız arayüz karakteridir.
- Sonuç sayıları Hiy-Z’ye veya başka bir fixture’a sabitlenmez. Fixture verileri sadece test ve görsel geliştirme içindir.
- Her ay paralel indirme yapılmaması bilinçli bir API nezaketi ve güvenilirlik kararıdır.
- Hatalı bir ayı atlayıp eksik sonucu başarı gibi göstermek yerine taramanın durması bilinçli bir doğruluk kararıdır.
- İlk fikirdeki “binlerce mezar” şeklinde nihai mezarlık sahnesi uygulanmış değildir. Mevcut yön, ordunun kariyerini onurlandıran sonuç ekranı ve posteridir.

## 13. Bilinen teknik sınırlar ve dikkat noktaları

- Uygulama Chess.com PubAPI’nin tarayıcıdan CORS ile erişilebilir kalmasına, veri biçimine ve hizmet durumuna bağlıdır. API davranışı değişirse istemci güncellenmelidir.
- Chess.com verileri önbellekli olabilir; en yeni oyun hemen arşivde görünmeyebilir. Erişilebilir geçmiş ve toplamlar zaman içinde değişir.
- Çok uzun kariyerlerde süre; arşiv ayı, maç sayısı, ağ hızı ve cihaz işlemcisine göre artar. Bir ayın JSON dizisi o ay işlenirken bellektedir ve görülen kimlik kümesi maç sayısıyla büyür. Bütün kariyer PGN’si birlikte saklanmaz.
- Web sürümü modern Web Worker, `fetch`, `AbortSignal.timeout()`, yerel depolama için tarayıcı desteği ve Chess.com’a doğrudan ağ erişimi bekler. Worker veya güvenli zaman aşımı özelliği yoksa anlamlı hata verir.
- Yerel ağda `http://192.168...` gibi güvenli olmayan bağlamlarda Web Crypto bulunmayabilir. Mevcut SHA-256 yedeği yalnız tekrar kimliği üretimini sürdürür; başka tarayıcı güvenlik özelliklerini devre dışı bırakmaz.
- İptal, çalışan Worker’ı sonlandırır. Kısmi sonuç kullanıcıya sonuç olarak sunulmaz.
- Tarayıcı bellek ölçümü her ortamda yoktur ve Worker belleğini tam yansıtmayabilir. Teknik ayrıntılardaki bellek değeri yaklaşık veya “raporlanmıyor” olabilir.
- Otomatik Chromium mobil görünüm testi, gerçek telefon işlemci ve bellek sınırlarının tam karşılığı değildir. Fiziksel cihaz testleri önemini korur.
- Kullanıcıya gösterilen ad, forma yazılan değerin yalnız baş/son boşlukları temizlenmiş hâlidir. API eşleştirme ve cache anahtarı küçük harfli olabilir. Bu iki kullanım birbirine karıştırılmamalıdır.
- Cache anahtarı ve bazı iç adlar hâlâ projenin eski “satranc-mezarligi” teknik adını taşır. Kullanıcıya dönük marka Düşen Taşlar’dır. İç anahtarları nedensiz değiştirmek eski cache uyumluluğunu bozabilir.
- Eski cache sonucunda `careerRecords` bulunmayabilir; arayüz bunun için yeniden tarama mesajı gösterir. Poster eksik kayıtları `Kayıt bulunamadı` diye ele alır.
- Oyun bağlantıları arayüzde yalnız HTTPS ve Chess.com alan adı doğrulamasından sonra gösterilir.
- Bağımsız doğrulayıcı üretim sayacından farklı matematik kullanır, fakat aynı `chess.js` PGN ayrıştırıcısına bağlıdır.
- Tarihli Hiy-Z sayıları yalnız o tarihte erişilebilen veri kümesinin ölçümüdür. Ürün sabiti, beklenen güncel toplam veya başka hesaplara genellenebilir performans garantisi değildir.

### README ile güncel uygulama arasındaki fark

README’nin veri akışı, sayım, retry, cache ve Worker mimarisi büyük ölçüde günceldir. Ancak girişindeki “final mezarlık görseli, animasyon yok” ve “sade sonuç ekranı” ifadeleri mevcut arayüzün gerisinde kalmıştır. Binlerce mezardan oluşan nihai mezarlık sahnesi gerçekten yoktur; buna karşılık yükleme atı animasyonu, tamamlanmış sonuç tasarımı, karakter illüstrasyonları ve indirilebilir kariyer posteri artık çalışmaktadır. Gelecekte bu konuda karar verirken çalışan kod esas alınmalıdır.

README’deki Hiy-Z maç ve taş toplamları, 6 Ağustos 2026 tarihli canlı ölçüm ve denetim anlık görüntüleridir. Hesabın geçmişi değişebileceğinden güncel ürün sonucu olarak kabul edilmemelidir.

## 14. Projenin mevcut tamamlanma durumu

Proje yalnız teknik fikir deneyi olmaktan çıkmış, uçtan uca çalışan ve görsel dili belirlenmiş bir web prototipi durumundadır. Kullanıcı adı girişinden bütün geçmiş taramasına, güvenli retry ve iptale, doğrulanmış taş sayımına, kariyer kayıtlarına, kısa süreli cache’e, responsive sonuç ekranına ve gerçek PNG poster indirmesine kadar ana akış mevcuttur. CLI ve bağımsız denetim araçları da çalışır durumdadır.

Test paketi; sayımın özel durumlarını, seri ay işlemeyi, tekrar engellemeyi, istemci hatalarını, retry davranışını, cache uyumluluğunu, Worker mesajlarını, kariyer kayıtlarını ve SHA-256 yedeğini kapsar. Playwright senaryoları mobil/masaüstü taşmaları, görsel yüklemeyi, erişilebilir bağlantı ve modal davranışını, konsol hatalarını, posterin 1080×1350 ölçüsünü ve gerçek indirilen PNG’yi kontrol eder. Canlı Chess.com testleri ayrı komutlardır; normal fixture testleri yeni tam kariyer taraması yapmaz.

Henüz public production alan adı, barındırma kararı, izleme sistemi veya gerçek kullanıcı trafiği yoktur. Bu nedenle ürün yayınlanmış ve operasyonel olarak tamamlanmış sayılmamalıdır. Mevcut aşama, yerelde çalışan güçlü bir ilk sürüm/prototip olarak değerlendirilmelidir.

## 15. Gelecekte değerlendirilebilecek fikirler

Aşağıdakiler mevcut özellik veya kesin yol haritası değildir; ürün sahibiyle değerlendirilmesi gereken seçeneklerdir:

- Statik bir barındırma servisi ve gerçek alan adı seçerek web sürümünü yayınlamak.
- Farklı yaşta ve büyüklükte hesaplarla, özellikle düşük donanımlı gerçek telefonlarda süre ve bellek ölçmek.
- Trafik veya Chess.com sınırları sorun yaratırsa, ölçümlere dayanarak isteğe bağlı maç sınırı, sonuç cache stratejisi ya da sunucu/kuyruk yaklaşımını yeniden değerlendirmek.
- Site adresi kesinleştikten sonra poster paylaşma akışını veya isteğe bağlı bağlantıyı düşünmek.
- Erişilebilirlik, ekran okuyucu ve farklı mobil tarayıcı testlerini genişletmek.
- PubAPI veri biçimi değişikliklerini yakalayacak bakım kontrolleri eklemek.
- İlk “satranç mezarlığı” fikrindeki daha büyük görsel sahneyi, mevcut sıcak ve onurlandırıcı tasarım diliyle uyumluysa ayrıca değerlendirmek.
- Cache sürümleme ve eski sonuç göçünü, veri yapısı gelecekte tekrar değişirse daha açık bir modele taşımak.

Ücretli servis, backend, veri tabanı, analitik, kullanıcı hesabı veya çalışma şeklini önemli ölçüde değiştiren kararlar uygulanmadan önce ürün sahibinin onayı alınmalıdır.

## 16. Projeyi başka birine anlatırken bilinmesi gereken temel kavramlar

- **PubAPI:** Chess.com’un herkese açık oyuncu ve maç verilerini sunan API’si.
- **Arşiv ayı:** Chess.com’un geçmiş maçları yıl/ay halinde sunduğu veri birimi. Uygulama bunları seri işler.
- **PGN:** Oyunda gerçekleşen hamlelerin kaydı. Taş kaybı hesabının ana kaynağıdır.
- **FEN:** Belirli bir andaki tahta konumu. PGN yeniden oynatmasının doğru yerde bittiğini kontrol eder ve denetimde taş envanteri sağlar.
- **Ply:** Tek bir oyuncunun yaptığı yarım hamle. İki ply yaklaşık bir tam hamledir; gösterilen hamle sayısı yukarı yuvarlanır.
- **Terfi:** Piyonun son sıraya ulaşıp başka bir taşa dönüşmesi. Dönüşüm kayıp değildir; terfi taşı alınırsa yeni türüyle kayıptır.
- **Geçerken alma:** Özel bir piyon alma kuralı. Normal piyon kaybı olarak sayılır.
- **Web Worker:** Ağ ve PGN işini ana arayüzden ayıran tarayıcı çalışma alanı.
- **Seri işleme:** Bir arşiv ayı bitmeden diğerine istek gönderilmemesi. API’yi zorlamaz ve ilerlemeyi öngörülebilir kılar.
- **Retry/backoff:** Geçici hata veya hız sınırında hemen tekrar tekrar istek göndermek yerine artan sürelerle bekleme.
- **Tekrar engelleme:** UUID, URL ve SHA-256 içerik parmak iziyle aynı maçın bir kez sayılması.
- **Kanonik ad ve görünen ad:** Chess.com/API eşleştirmesi için kullanılan ad ile kullanıcının forma yazdığı büyük/küçük harf biçimi farklı amaçlara hizmet eder.
- **Kariyer kaydı:** Bütün maçları saklamadan, her yeni analiz sonucunda en iyi adayın güncellendiği seçilmiş maç özeti.
- **Cache:** Tamamlanan küçük sonucun aynı cihazda altı saat tutulması; sunucu hesabı veya kalıcı kullanıcı verisi değildir.
- **Fixture:** Gerçek API çağrısı yapmadan arayüz ve görsel testinde kullanılan örnek veri. Hiy-Z fixture sayıları ürün içine sabitlenmiş gerçek sonuç değildir.
- **Taş-korunumu denetimi:** Üretim sayacını farklı hesapla karşılaştıran geliştirme doğrulaması; kullanıcıya sunulan ikinci sonuç değildir.
- **Responsive ön izleme ve sabit tuval:** Poster ekranda küçülebilir, fakat indirilen iç tasarım her zaman 1080×1350 pikseldir.
- **İstemci tarafı işleme:** Verinin uygulamanın sunucusu yerine kullanıcının tarayıcısında işlenmesi.

## Yapay zekâ için kullanım notu

Bu belge, Düşen Taşlar’ın ürün amacını, doğrulanmış çalışma biçimini, tasarım dilini ve şimdiye kadar alınmış önemli kararları kalıcı ve okunabilir biçimde özetler. Yeni bir görevde kapsamı ve niyeti anlamak için başlangıç bağlamı olarak kullanılmalıdır. Ancak proje gelişmeye devam edebilir; en güncel teknik durum için erişim varsa kaynak kodu, testler ve ilgili yapılandırmalar da kontrol edilmelidir. Bu belgedeki tarihli canlı ölçümler örnektir ve güncel Chess.com sonucu varsayılmamalıdır.
