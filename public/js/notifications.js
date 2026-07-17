(function () {
  "use strict";

  function toDateOnly(value) {
    const date = new Date(`${value}T12:00:00`);
    date.setHours(12, 0, 0, 0);
    return date;
  }

  function dayDiff(from, to) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round((toDateOnly(to) - toDateOnly(from)) / oneDay);
  }

  function money(value) {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function getStudentName(student) {
    if (!student) return "Öğrenci";
    return `${student.firstName || ""} ${student.lastName || ""}`.trim() || "Öğrenci";
  }

  function getBranchName(branch) {
    return branch ? branch.name : "Branş";
  }

  function paymentMessage(payment, student, branch, variant) {
    const name = getStudentName(student);
    const branchName = getBranchName(branch);

    if (variant === "overdue" || variant === "critical") {
      return `Merhaba ${name}, ${branchName} branşına ait ödemeniz gecikmiş görünmektedir. Kalan borcunuz: ${money(payment.remainingAmount)}. Lütfen ödeme durumunuzu kontrol ediniz.`;
    }

    return `Merhaba ${name}, ${branchName} branşına ait ${money(payment.remainingAmount || payment.totalAmount)} ödemenizin son ödeme tarihi ${payment.dueDate} olarak görünmektedir. İyi günler dileriz.`;
  }

  function normalizePhone(phone) {
    const digits = String(phone || "")
      .replace(/[^\d]/g, "")
      .replace(/^0+/, "");
    if (!digits) return "";
    return digits.startsWith("90") ? digits : `90${digits}`;
  }

  function createWhatsAppLink(payment) {
    const storage = window.CaYaStorage;
    const students = storage.getData(storage.KEYS.students, []);
    const branches = storage.getData(storage.KEYS.branches, []);
    const normalized = storage.normalizePayment(payment);
    const student = students.find((item) => item.id === normalized.studentId);
    const branch = branches.find((item) => item.id === normalized.branchId);
    const type = normalized.status === "Gecikti" ? "overdue" : "upcoming";
    const message = paymentMessage(normalized, student, branch, type);
    const phone = normalizePhone(student && student.phone);
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  function generatePaymentNotifications() {
    const storage = window.CaYaStorage;
    const today = storage.todayISO();
    const settings = storage.getData(storage.KEYS.settings, {});
    const reminderDay = Number(settings.reminderDay || 3);
    const students = storage.getData(storage.KEYS.students, []);
    const branches = storage.getData(storage.KEYS.branches, []);
    const payments = storage.normalizePayments(storage.getData(storage.KEYS.payments, []));
    const previousNotifications = new Map(
      storage.getData(storage.KEYS.notifications, []).map((item) => [item.id, item])
    );
    // Only the owner persists data side-effects (scoped users have read-limited
    // or no payment access and would be rejected by the server).
    const canPersist = !window.CaYaApp || !window.CaYaApp.access || window.CaYaApp.access.isOwner();
    if (canPersist) storage.setData(storage.KEYS.payments, payments);

    const notifications = payments
      .filter((payment) => payment.status !== "İptal" && Number(payment.remainingAmount || 0) > 0 && payment.dueDate)
      .map((payment) => {
        const days = dayDiff(today, payment.dueDate);
        const student = students.find((item) => item.id === payment.studentId);
        const branch = branches.find((item) => item.id === payment.branchId);
        let title = "";
        let severity = "warning";
        let variant = "upcoming";

        if (days < -7) {
          title = "Kritik gecikme";
          severity = "danger";
          variant = "critical";
        } else if (days < 0) {
          title = "Geciken ödeme";
          severity = "danger";
          variant = "overdue";
        } else if (days === 0) {
          title = "Bugün son ödeme günü";
          severity = "warning";
        } else if (days <= reminderDay) {
          title = "Yaklaşan ödeme";
          severity = "info";
        }

        if (!title) return null;

        const id = `not_${payment.id}_${payment.dueDate}`;
        const existing = previousNotifications.get(id);

        return {
          id,
          paymentId: payment.id,
          studentId: payment.studentId,
          branchId: payment.branchId,
          title,
          severity,
          daysRemaining: days,
          message: paymentMessage(payment, student, branch, variant),
          studentName: getStudentName(student),
          branchName: getBranchName(branch),
          remainingAmount: payment.remainingAmount,
          dueDate: payment.dueDate,
          createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString()
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    if (canPersist) storage.setData(storage.KEYS.notifications, notifications);
    return notifications;
  }

  window.CaYaNotifications = {
    generatePaymentNotifications,
    createWhatsAppLink,
    paymentMessage,
    normalizePhone
  };
})();
