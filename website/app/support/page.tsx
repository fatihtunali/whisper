import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support - Whisper",
  description: "Get help and support for Whisper messaging application",
};

export default function Support() {
  return (
    <main className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-950 border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">Whisper</span>
          </Link>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-white mb-4">Support</h1>
        <p className="text-gray-400 mb-12">We&apos;re here to help you get the most out of Whisper</p>

        <div className="space-y-10">
          {/* Contact Section */}
          <section className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
            <h2 className="text-2xl font-semibold text-white mb-4">Contact Us</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              Have a question, feedback, or need assistance? We&apos;d love to hear from you.
            </p>
            <div className="space-y-4">
              <a
                href="mailto:support@sarjmobile.com"
                className="flex items-center gap-3 text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                support@sarjmobile.com
              </a>
            </div>
          </section>

          {/* FAQ Section */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-6">Frequently Asked Questions</h2>
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">What is a Whisper ID?</h3>
                <p className="text-gray-300">
                  Your Whisper ID (e.g., WSP-XXXX-XXXX-XXXX) is your unique, anonymous identifier on Whisper. Share it with others so they can message you - no phone number or email required.
                </p>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">How do I add contacts?</h3>
                <p className="text-gray-300">
                  You can add contacts by scanning their QR code or by manually entering their Whisper ID. Go to Contacts tab and tap the + button to add a new contact.
                </p>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">What is the recovery phrase?</h3>
                <p className="text-gray-300">
                  Your 12-word recovery phrase is the only way to restore your account on a new device. Write it down and keep it safe - we cannot recover it for you if lost.
                </p>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">Are my messages really private?</h3>
                <p className="text-gray-300">
                  Yes. All messages are end-to-end encrypted using X25519 key exchange and XSalsa20-Poly1305 encryption. Only you and your recipient can read your messages - not even we can access them.
                </p>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">How do I block someone?</h3>
                <p className="text-gray-300">
                  Open a chat with the person, tap the menu icon (three dots) in the top right, and select &quot;Block User&quot;. You won&apos;t receive messages from blocked users.
                </p>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">Can I use Whisper on multiple devices?</h3>
                <p className="text-gray-300">
                  Currently, Whisper works on one device at a time. You can transfer your account to a new device using your 12-word recovery phrase. Multi-device support is planned for a future update.
                </p>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">What happens to messages when I&apos;m offline?</h3>
                <p className="text-gray-300">
                  Messages sent to you while offline are stored encrypted on our servers for up to 72 hours. Once you come online, they&apos;re delivered to your device and deleted from our servers.
                </p>
              </div>
            </div>
          </section>

          {/* Troubleshooting Section */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-6">Troubleshooting</h2>
            <div className="space-y-6">
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">Messages not sending?</h3>
                <p className="text-gray-300">
                  Check your internet connection. If the problem persists, try closing and reopening the app. Make sure you have the latest version of Whisper installed.
                </p>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">QR code not scanning?</h3>
                <p className="text-gray-300">
                  Ensure you&apos;ve granted camera permissions to Whisper. Make sure the QR code is well-lit and fully visible in the scanner frame. Try increasing screen brightness on the other device.
                </p>
              </div>

              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-white mb-2">Lost my recovery phrase</h3>
                <p className="text-gray-300">
                  If you&apos;ve lost your recovery phrase but still have access to the app, go to Settings &gt; Profile to view it again. If you&apos;ve lost both your device and recovery phrase, unfortunately your account cannot be recovered.
                </p>
              </div>
            </div>
          </section>

          {/* Report Section */}
          <section className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
            <h2 className="text-2xl font-semibold text-white mb-4">Report an Issue</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Found a bug or experiencing technical issues? Please email us with details about:
            </p>
            <ul className="space-y-2 text-gray-300 mb-6">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>Your device model and operating system version</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>Steps to reproduce the issue</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>What you expected to happen vs. what actually happened</span>
              </li>
            </ul>
            <a
              href="mailto:support@sarjmobile.com?subject=Bug Report"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Report a Bug
            </a>
          </section>

          {/* Links Section */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-6">Helpful Links</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Link href="/privacy" className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-indigo-600 transition-colors">
                <h3 className="text-lg font-medium text-white mb-2">Privacy Policy</h3>
                <p className="text-gray-400 text-sm">Learn how we protect your data</p>
              </Link>
              <Link href="/terms" className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-indigo-600 transition-colors">
                <h3 className="text-lg font-medium text-white mb-2">Terms of Service</h3>
                <p className="text-gray-400 text-sm">Our terms and conditions</p>
              </Link>
              <Link href="/child-safety" className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-indigo-600 transition-colors">
                <h3 className="text-lg font-medium text-white mb-2">Child Safety</h3>
                <p className="text-gray-400 text-sm">Our commitment to child safety</p>
              </Link>
              <Link href="/" className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-indigo-600 transition-colors">
                <h3 className="text-lg font-medium text-white mb-2">Home</h3>
                <p className="text-gray-400 text-sm">Back to main page</p>
              </Link>
            </div>
          </section>
        </div>
      </article>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <Link href="/" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </footer>
    </main>
  );
}
