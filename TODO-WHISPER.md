# Whisper - Development Roadmap

> Son güncelleme: 13 Ocak 2026

---

## Phase 1: App Store Requirements & Critical Features
> Öncelik: App Store onayı ve temel kullanılabilirlik

### Legal Pages (Mobile App)
- [x] Terms of Service sayfası ✅
- [x] Privacy Policy sayfası ✅
- [x] Child Safety sayfası ✅
- [x] About / Help sayfası ✅

### Critical Features
- [x] **Push Notifications** - yeni mesaj bildirimleri ✅
- [x] Block user - kullanıcı engelleme ✅
- [x] Delete account - hesap silme (GDPR gereksinimi) ✅
- [x] In-app reporting - şüpheli içerik/davranış raporlama ✅
- [x] Manual chat deletion - sohbet silme ✅

### Child Safety Compliance
- [x] Raporların hızlı incelenmesi ✅ (Admin API + ReportService)
- [x] İhlal durumunda hesap kapatma ✅ (AdminService + ban system)
- [x] Kolluk kuvvetleri ile işbirliği ✅ (Law enforcement export API)

---

## Phase 2: Core Messaging Features
> Öncelik: Temel kullanıcı deneyimi

### Messaging
- [x] Contact nicknames - kişilere takma ad verme ✅
- [x] Reply to message - mesaja yanıt verme ✅
- [x] Message search - mesajlarda arama ✅

### Privacy Controls
- [x] Read receipts toggle - okundu bilgisi açma/kapama ✅
- [x] Typing indicator toggle - yazıyor göstergesi açma/kapama ✅

### UX
- [x] Dark/Light theme toggle - tema değiştirme ✅

---

## Phase 3: Media & Rich Content
> Öncelik: Zengin içerik paylaşımı

- [x] Send images - fotoğraf gönderme ✅
- [x] Voice messages - sesli mesaj ✅
- [x] Send files - dosya gönderme ✅
- [x] Emoji reactions - mesaja emoji tepkisi ✅

---

## Phase 4: Advanced Features
> Öncelik: Gelişmiş özellikler

### Communication
- [x] Voice call - sesli arama ✅
- [x] Video call - görüntülü görüşme ✅
- [x] Group chat - grup sohbeti ✅

### Privacy & Security
- [x] Disappearing messages - otomatik mesaj silme (24 saat, 7 gün, vb.) ✅
- [x] App lock (PIN/Biometrics) - uygulama kilidi ✅
- [x] Online status privacy - çevrimiçi durumu gizleme ✅
- [x] Message forwarding - mesaj iletme ✅

---

## Future (Gelecek)
> Uzun vadeli hedefler

- [ ] Screenshot blocking - ekran görüntüsü engelleme
- [ ] Multi-device sync - çoklu cihaz senkronizasyonu (anahtar yönetimi gerekli)
- [ ] Message backup/export - mesaj yedekleme/dışa aktarma (şifreli)
- [ ] Status/Stories - durum paylaşımı (24 saat sonra kaybolan)
- [ ] Web App - tarayıcı uygulaması (güvenlik değerlendirmesi gerekli)
- [ ] Desktop App (Electron) - masaüstü uygulaması (web'den daha güvenli alternatif)

---

## Progress Tracking

| Phase | Toplam | Tamamlanan | Durum |
|-------|--------|------------|-------|
| Phase 1 | 12 | 12 | ✅ Completed |
| Phase 2 | 6 | 6 | ✅ Completed |
| Phase 3 | 4 | 4 | ✅ Completed |
| Phase 4 | 7 | 7 | ✅ Completed |
| Future | 6 | 0 | ⏳ Planned |
