# Düşen Taşlar — Teknik Anlatabilme Rehberi

Bu rehberin amacı kod yazmayı öğretmek değil, ürünün parçalarını doğru isimlerle tanımayı ve aralarındaki veri akışını anlatabilmeyi sağlamaktır.

## 1. Mutlaka bilmem gerekenler

### Projeyi oluşturan teknolojilerle kısa anlatım

Düşen Taşlar, JavaScript ile geliştirilmiş bir React web uygulamasıdır. Vite uygulamayı geliştirme sırasında çalıştırır ve yayınlanabilir statik dosyalara dönüştürür. Kullanıcının herkese açık maçları Chess.com PubAPI’den alınır; PGN hamle kayıtları chess.js ile tarayıcıda yeniden oynatılır, final FEN konumuyla doğrulanır ve kaybedilen taşlar uygulamanın kendi hesabıyla bulunur. Ağ ve hesaplama işi Web Worker içinde yürütülür. Tamamlanan sonuç kısa süreli olarak localStorage’da saklanır. Kullanıcı isterse aynı sonuçtan modern-screenshot yardımıyla, yine tarayıcı içinde PNG kariyer posteri oluşturabilir.

### Teknolojiler ne, ne yapıyor ve neden kullanılıyor?

**JavaScript**, projenin programlama dilidir. Arayüzü, maç taramasını, taş sayımını ve poster indirmeyi çalıştırır. Tarayıcıda ve Node.js aracında kullanılabildiği için aynı hesaplama çekirdeği paylaşılır.

**React**, kullanıcı arayüzü kütüphanesidir. Form, ilerleme, sonuç kartları ve poster penceresini yönetir. Müşterinin gördüğü salon gibidir; backend veya uzaktaki hesaplama servisi değildir.

**Vite**, geliştirme ve paketleme aracıdır. React, Worker ve görselleri işler; küçük uygulama için sade ve hızlıdır. Yayınlama servisi değildir ve proje henüz Vercel veya başka bir servise dağıtılmamıştır.

**Chess.com PubAPI**, herkese açık profil ve ham maç verisini sağlayan internet servisidir. Profil, arşiv ayları, PGN ve final konumu buradan gelir. API hazır taş kaybı istatistiği vermez; toplamları bizim uygulamamız hesaplar.

**PGN**, gerçekleşen hamlelerin yazılı kaydıdır. Maçın güvenlik kamerası gibi hangi taşların gerçekten alındığını gösterir.

**FEN**, belirli andaki tahta konumudur. Final FEN, PGN yeniden oynatmasının doğru yerde bittiğini doğrular: PGN yolculuk, FEN varış noktasıdır.

**chess.js**, satranç kurallarını bilen kütüphanedir. PGN’yi yeniden oynatıp alma, terfi ve geçerken almayı yorumlar. Veri kaynağı değildir; gelen hamleleri anlayan hakemdir.

**Web Worker**, tarayıcıdaki ayrı iş alanıdır. Chess.com istekleri ve PGN işlemesi burada yürürken React ilerleme gösterir. Ayrı sunucu değil, aynı cihazdaki uygulamanın parçasıdır.

**localStorage**, tarayıcının yerel saklama alanıdır. Sonuç özeti aynı cihazda altı saat tutulur; ham maçlar saklanmaz. Kullanıcı hesabı veya merkezi veri tabanı değildir.

**modern-screenshot**, poster bileşenini tarayıcıda PNG’ye dönüştüren kütüphanedir. Sunucu kullanmadan sabit ölçülü çıktı verdiği için seçilmiştir.

### Kullanıcı adından sonuç ekranına veri yolculuğu

1. Kullanıcı adını yazar; uygulama biçimi doğrular ve görünen yazımı korur.
2. Geçerli yakın tarihli yerel sonuç varsa localStorage’dan okunur.
3. Yoksa React bir Worker başlatıp kullanıcı adını gönderir.
4. Worker PubAPI’den profil ve arşiv aylarını alır.
5. Aylar eskiden yeniye tek tek indirilir; kariyer topluca belleğe doldurulmaz.
6. Renk belirlenir, PGN chess.js ile oynatılır ve final FEN kontrol edilir.
7. Kayıplar toplam ve kariyer kayıtlarına eklenir; tekrar maç sayılmaz.
8. Worker ilerlemeyi React’e bildirir; kullanıcı isterse iptal eder.
9. Final sonuç React’e gelir, kısa süre saklanır ve ekranda gösterilir.

Chess.com tarafının görevi herkese açık ham veriyi sunmaktır. Renk eşleştirme, PGN oynatma, doğrulama, taş toplama, kariyer kayıtlarını seçme, cache ve arayüz tamamen kullanıcının tarayıcısında gerçekleşir.

### Kariyer posteri indirilirken ne olur?

“Kariyer kartını hazırla” yeni tarama başlatmaz; mevcut sonuç 1080×1350 piksel CareerPoster’a aktarılır. Ön izleme ekrana göre küçülür, gerçek ölçü değişmez. İndirmede fontlar ve WebP’ler beklenir, modern-screenshot PNG Blob üretir, ölçü doğrulanır, güvenli adla indirilir ve geçici bağlantılar temizlenir. Hepsi tarayıcıda olur.

### Backend ve veri tabanı olmaması ne demek?

Projeye ait hesaplama sunucusu ve merkezi veri tabanı yoktur. Ham maçlar bize gönderilmez, üyelik yoktur ve başlangıç maliyeti düşüktür. Karşılığında işi kullanıcının cihazı yapar ve doğrudan Chess.com erişimine ihtiyaç duyar. React, Worker ve localStorage’ın hiçbiri backend değildir.

### Taş sayımının temel kuralları

Kullanıcının rengi, yazılan ve Chess.com’dan gelen kullanıcı adları ile profil bilgisinin oyundaki beyaz ve siyah taraflarla eşleştirilmesiyle bulunur. Renk güvenilir biçimde belirlenemiyorsa maç atlanır.

Yalnız PGN’de gerçekten gerçekleşen alma hamleleri sayılır. Mat, terk veya sürenin bitmesi, tahtada duran taşları kayıp yapmaz. Kullanıcının aldığı rakip taşları değil, rakibin aldığı kullanıcı taşları toplanır.

Piyon terfi ettiğinde kayıp sayılmaz; başka bir türe dönüşür. Terfi etmiş taş daha sonra alınırsa yakalandığı türle sayılır. Geçerken alınan piyon normal piyon kaybıdır. Şah fiilen alınmadan oyun bittiği için toplamda yer almaz; “0 kayıp” şah kartı mizahi arayüz detayıdır.

Standart dışı varyant, eksik veya bozuk PGN, tamamlanmamış oyun, çözülemeyen renk ya da PGN ile final FEN uyuşmazlığı varsa sonuç güvenilir değildir. Uygulama tahmin yürütmek yerine maçı tamamen atlar; kısmi sayı eklemez.

### Kariyer kayıtları nasıl seçilir?

**En kanlı zafer**, kullanıcının kazandığı maçlar arasında kendi ordusundan en fazla taş kaybettiği oyundur.

**En uzun savaş**, kazanma şartı olmadan, incelenen bütün maçlar arasındaki en yüksek yarım hamle sayısına sahip oyundur.

**En hızlı mat**, yalnız kullanıcının kazandığı ve rakibin Chess.com sonucunun gerçekten “mat oldu” anlamına geldiği oyunlar arasındaki en kısa maçtır. Timeout veya terk galibiyeti bu kayıt değildir.

Eşitlikte önce daha yeni maç, sonra kararlı oyun kimliği seçilir. Bu kayıtlar maç işlenirken güncellenir; PGN ikinci kez oynatılmaz ve bütün maçlar bellekte tutulmaz.

### Projeyi anlatırken yapılmaması gereken yanlışlar

- “Chess.com kayıp istatistiklerini veriyor” deme. Chess.com maçları verir; hesabı Düşen Taşlar yapar.
- “React backend” deme. React yalnız kullanıcı arayüzünü yönetir.
- “chess.js maçları indiriyor” deme. Maçları PubAPI sağlar; chess.js hamleleri yorumlar.
- “Worker ayrı sunucuda çalışıyor” deme. Worker kullanıcının tarayıcısındadır.
- “Sonuçlar hesabımızda saklanıyor” deme. Yalnız aynı cihazda kısa süreli yerel cache vardır.
- Tailwind CSS, PixiJS, Stockfish veya yapay zekâ kullanıldığını söyleme; bunlar projede yoktur.
- Projenin Vercel’de veya başka bir serviste yayında olduğunu söyleme. Henüz public production dağıtımı yoktur.
- Tarihli Hiy-Z test rakamlarını herkes için geçerli veya değişmez ürün sonucu gibi anlatma.

## 2. Bilmem faydalı ama ezberlemem gerekmeyenler

**CORS**, tarayıcının başka bir alan adındaki Chess.com verisine erişmesine izin verilip verilmediğini belirleyen güvenlik kuralıdır. Doğrudan tarayıcı mimarisi bunun çalışmasına bağlıdır.

**SHA-256 parmak izi**, UUID veya URL eksik/çakışmalı olsa bile aynı maçı tanımaya yardım eder. Burada parola güvenliği için değil, tekrar engellemek için kullanılır.

**Retry/backoff**, geçici ağ veya hız sınırı sorununda API’ye art arda yüklenmek yerine bekleyip yeniden denemektir. **Cache anahtarı**, yerel sonucu doğru kullanıcıyla eşleştiren etikettir.

**Production build**, Vite’ın kaynakları tarayıcıya sunulacak küçültülmüş ve düzenlenmiş dosyalara çevirmesidir; tek başına siteyi internete yayınlamaz.

**Otomatik testler**, sayım ve veri akışının bilinen kuralları bozmadığını kontrol eder. **Playwright**, uygulamayı gerçek Chromium ortamına yakın biçimde açıp mobil görünüm, Worker, konsol, poster ve PNG gibi tarayıcı davranışlarını doğrular.

## Hazır anlatımlar

### 1. Projeyi 30 saniyede anlatım

Düşen Taşlar, Chess.com’daki herkese açık kariyerini tarayıp oyunlarda kaybettiğin piyon, at, fil, kale ve vezirleri hesaplayan bir web uygulaması. Chess.com yalnız ham maçları veriyor; PGN’leri tarayıcıda biz işliyor ve toplamları kendimiz çıkarıyoruz. Sonuç, karakterli bir kariyer arşivi olarak gösteriliyor ve 1080×1350 PNG poster indirilebiliyor. Backend, veri tabanı veya üyelik yok; işlem kullanıcının cihazında yapılıyor.

### 2. Projeyi 2 dakikada anlatım

Kullanıcı Chess.com adını yazınca uygulama profilini ve aylık arşivleri PubAPI’den sırayla alıyor. API hazır kayıp istatistiği değil, PGN ve oyun verisi sağlıyor. Worker içindeki çekirdek PGN’yi chess.js ile oynatıp kullanıcının rengini ve gerçekten alınan taşlarını buluyor. Terfi kayıp değil; terfi taşı alınırsa son türüyle sayılıyor. Geçerken alma piyon kaybı, şah sayılmıyor. Güvenilmeyen maçlar atlanıyor.

React ilerlemeyi ve sonucu gösteriyor. Taş dağılımına üç kariyer kaydı eşlik ediyor. Özet aynı cihazda geçici saklanıyor; mevcut sonuçtan yeni API çağrısı olmadan sabit ölçülü PNG poster hazırlanıyor. Backend ve veri tabanı olmadığından ham maçlar bize gelmiyor. Proje çalışan yerel prototip, henüz public bir servise dağıtılmadı.

### 3. Teknik bilgisi olan birine anlatım

React/Vite tabanlı istemci, Chess.com PubAPI’ye doğrudan erişiyor. Ağ ve tüm geçmiş taraması bir module Web Worker’da; UI ile ilerleme/final mesajları üzerinden haberleşiyor. Aylık arşivler seri işleniyor, maçlar UUID, URL ve SHA-256 parmak iziyle tekilleştiriliyor. Ortak JavaScript çekirdeği PGN’yi chess.js ile replay edip final FEN’i doğruluyor; gerçekleşen capture olaylarından kullanıcının kayıplarını ve tek geçişte kariyer kayıtlarını üretiyor. Sonuç altı saat localStorage’da tutuluyor. CareerPoster gerçek sonuç props’larıyla 1080×1350 DOM oluşturuyor; modern-screenshot istemci tarafında PNG Blob üretiyor. Backend ve veri tabanı yok, aynı çekirdek Node CLI tarafından da kullanılıyor.

## Kendimi kontrol etmek için 5 kısa soru

**1. Chess.com API taş kaybı toplamını hazır mı veriyor?**  
Hayır. API ham profil ve maç verisini verir; taş kaybını uygulama PGN’lerden hesaplar.

**2. React, chess.js ve Web Worker’ın görevleri nasıl ayrılır?**  
React arayüzü yönetir, chess.js satranç hamlelerini yorumlar, Worker ağ ve hesaplamayı tarayıcıda arka planda yürütür.

**3. Neden PGN yanında final FEN de kullanılıyor?**  
PGN yeniden oynatıldığında doğru son tahta konumuna ulaşıldığını kontrol etmek için.

**4. Terfi eden piyon ne zaman kayıp sayılır?**  
Terfi anında sayılmaz. Daha sonra alınırsa dönüştüğü taş türüyle kayıp sayılır.

**5. Backend olmaması kullanıcı verisi ve iş yükü açısından ne anlama gelir?**  
Ham maçlar projeye ait sunucuya gönderilmez ve merkezi veri tabanında tutulmaz; hesaplama yükünü kullanıcının tarayıcısı taşır.
