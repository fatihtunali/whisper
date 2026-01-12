import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Child Safety Standards - Whisper",
  description: "Child Safety Standards and CSAE Policy for Whisper messaging application",
};

export default function ChildSafety() {
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
        <h1 className="text-4xl font-bold text-white mb-4">Child Safety Standards</h1>
        <p className="text-gray-400 mb-12">Last updated: January 12, 2026</p>

        <div className="space-y-10">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Our Commitment to Child Safety</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Whisper is committed to creating a safe environment for all users and has zero tolerance for child sexual abuse and exploitation (CSAE). We actively work to prevent our platform from being used to harm children in any way.
            </p>
            <p className="text-gray-300 leading-relaxed">
              This document outlines our standards, policies, and procedures for preventing, detecting, and responding to child sexual abuse material (CSAM) and child exploitation on our platform.
            </p>
          </section>

          {/* Age Restriction */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Age Restriction</h2>
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-4">
              <p className="text-red-300 font-medium">
                Whisper is strictly for users aged 13 and older. Users under the age of 13 are not permitted to use our service.
              </p>
            </div>
            <p className="text-gray-300 leading-relaxed">
              By creating an account on Whisper, users confirm that they are at least 13 years old. We reserve the right to terminate any account that we believe belongs to a user under 13 years of age.
            </p>
          </section>

          {/* Prohibited Content */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Prohibited Content and Behavior</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              The following content and behaviors are strictly prohibited on Whisper:
            </p>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Child sexual abuse material (CSAM) of any kind</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Sexual solicitation or grooming of minors</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Sexualized content involving minors, including AI-generated content</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Child trafficking or exploitation</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Sharing, distributing, or requesting CSAM</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Any content that sexualizes or endangers children</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Sextortion or coercion involving minors</span>
              </li>
            </ul>
          </section>

          {/* Detection and Prevention */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Detection and Prevention Measures</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              We implement multiple layers of protection to prevent child exploitation:
            </p>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>In-app reporting mechanisms for users to flag suspicious content or behavior</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>User blocking functionality to prevent unwanted contact</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Prompt review of all user reports related to child safety</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Immediate account termination for violations</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Cooperation with law enforcement agencies when required</span>
              </li>
            </ul>
          </section>

          {/* Reporting */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">How to Report CSAE</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              If you encounter any content or behavior that violates our child safety standards, please report it immediately using one of the following methods:
            </p>
            <div className="bg-gray-900 rounded-lg p-6 space-y-4">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">In-App Reporting</h3>
                <p className="text-gray-300">
                  Use the report function within the app to flag inappropriate content or users. Tap on the user profile or message and select &quot;Report&quot;.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Email</h3>
                <p className="text-gray-300">
                  Send detailed reports to our dedicated child safety team:
                </p>
                <a href="mailto:childsafety@sarjmobile.com" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
                  childsafety@sarjmobile.com
                </a>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-2">External Reporting</h3>
                <p className="text-gray-300">
                  You can also report CSAM directly to:
                </p>
                <ul className="mt-2 space-y-1 text-gray-300">
                  <li>
                    <a href="https://www.missingkids.org/gethelpnow/cybertipline" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                      National Center for Missing &amp; Exploited Children (NCMEC) CyberTipline
                    </a>
                  </li>
                  <li>
                    <a href="https://www.iwf.org.uk/report" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                      Internet Watch Foundation (IWF)
                    </a>
                  </li>
                  <li>Local law enforcement agencies</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Response Procedures */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Response Procedures</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              When we receive a report of potential CSAE, we take the following actions:
            </p>
            <ol className="space-y-3 text-gray-300 list-decimal list-inside">
              <li className="pl-2">
                <span className="font-medium text-white">Immediate Review:</span> All reports are reviewed within 24 hours by our safety team.
              </li>
              <li className="pl-2">
                <span className="font-medium text-white">Account Action:</span> Accounts involved in CSAE are immediately suspended pending investigation.
              </li>
              <li className="pl-2">
                <span className="font-medium text-white">Law Enforcement:</span> We report confirmed CSAM to NCMEC and cooperate fully with law enforcement investigations.
              </li>
              <li className="pl-2">
                <span className="font-medium text-white">Permanent Ban:</span> Confirmed violators are permanently banned from our platform.
              </li>
              <li className="pl-2">
                <span className="font-medium text-white">Documentation:</span> We maintain records of violations and actions taken as required by law.
              </li>
            </ol>
          </section>

          {/* User Safety Tips */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Safety Tips for Users</h2>
            <ul className="space-y-3 text-gray-300">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Never share personal information with strangers</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Block and report users who make you uncomfortable</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Trust your instincts - if something feels wrong, report it</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Parents should monitor their children&apos;s online activities</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Never agree to meet someone you only know online</span>
              </li>
            </ul>
          </section>

          {/* Contact Information */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Contact Information</h2>
            <div className="bg-indigo-900/20 border border-indigo-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-white mb-4">Child Safety Team</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-gray-400 text-sm">Email (CSAM Reports)</p>
                  <a href="mailto:childsafety@sarjmobile.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                    childsafety@sarjmobile.com
                  </a>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">General Inquiries</p>
                  <a href="mailto:safety@sarjmobile.com" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                    safety@sarjmobile.com
                  </a>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Response Time</p>
                  <p className="text-gray-300">All child safety reports are reviewed within 24 hours</p>
                </div>
              </div>
            </div>
          </section>

          {/* Policy Updates */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Policy Updates</h2>
            <p className="text-gray-300 leading-relaxed">
              We regularly review and update our child safety standards to ensure they remain effective and compliant with applicable laws and regulations. Any significant changes will be posted on this page with an updated revision date.
            </p>
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
