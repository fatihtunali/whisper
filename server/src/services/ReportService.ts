// Report Service - Handles user reports for Child Safety compliance
import { SUPER_ADMIN } from './AdminService';

export interface UserReport {
  id: string;
  reporterWhisperId: string;
  reportedWhisperId: string;
  reason: 'inappropriate_content' | 'harassment' | 'spam' | 'child_safety' | 'other';
  description?: string;
  timestamp: number;
  status: 'pending' | 'reviewed' | 'action_taken' | 'dismissed';
  reviewedAt?: number;
  reviewNotes?: string;
}

class ReportService {
  private reports: Map<string, UserReport> = new Map();
  private reportCounter = 0;

  // Submit a new report
  submitReport(
    reporterWhisperId: string,
    reportedWhisperId: string,
    reason: UserReport['reason'],
    description?: string
  ): UserReport {
    const id = `RPT-${Date.now()}-${++this.reportCounter}`;

    const report: UserReport = {
      id,
      reporterWhisperId,
      reportedWhisperId,
      reason,
      description,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.reports.set(id, report);
    console.log(`[ReportService] New report ${id}: ${reporterWhisperId} reported ${reportedWhisperId} for ${reason}`);

    // Log child safety reports with high priority
    if (reason === 'child_safety') {
      console.warn(`[ReportService] ⚠️ CHILD SAFETY REPORT: ${id} - Requires immediate review`);
      console.warn(`[ReportService] → Super Admin notification: ${SUPER_ADMIN.email}`);
      // TODO: In production, send email notification to SUPER_ADMIN.email
    }

    return report;
  }

  // Get all pending reports
  getPendingReports(): UserReport[] {
    return Array.from(this.reports.values())
      .filter(r => r.status === 'pending')
      .sort((a, b) => {
        // Prioritize child safety reports
        if (a.reason === 'child_safety' && b.reason !== 'child_safety') return -1;
        if (b.reason === 'child_safety' && a.reason !== 'child_safety') return 1;
        return a.timestamp - b.timestamp;
      });
  }

  // Get all reports for a specific user
  getReportsForUser(whisperId: string): UserReport[] {
    return Array.from(this.reports.values())
      .filter(r => r.reportedWhisperId === whisperId);
  }

  // Get report by ID
  getReport(reportId: string): UserReport | null {
    return this.reports.get(reportId) || null;
  }

  // Mark report as reviewed
  reviewReport(
    reportId: string,
    status: 'reviewed' | 'action_taken' | 'dismissed',
    notes?: string
  ): boolean {
    const report = this.reports.get(reportId);
    if (!report) return false;

    report.status = status;
    report.reviewedAt = Date.now();
    report.reviewNotes = notes;

    console.log(`[ReportService] Report ${reportId} marked as ${status}`);
    return true;
  }

  // Get statistics
  getStats(): { total: number; pending: number; childSafety: number } {
    const all = Array.from(this.reports.values());
    return {
      total: all.length,
      pending: all.filter(r => r.status === 'pending').length,
      childSafety: all.filter(r => r.reason === 'child_safety').length,
    };
  }

  // Export reports for law enforcement (anonymized metadata only)
  exportForLawEnforcement(reportIds: string[]): object[] {
    return reportIds
      .map(id => this.reports.get(id))
      .filter((r): r is UserReport => r !== null)
      .map(r => ({
        reportId: r.id,
        reportedUserId: r.reportedWhisperId,
        reason: r.reason,
        timestamp: new Date(r.timestamp).toISOString(),
        status: r.status,
        // Note: Actual message content is E2E encrypted and not accessible
      }));
  }
}

// Singleton instance
export const reportService = new ReportService();
export default reportService;
