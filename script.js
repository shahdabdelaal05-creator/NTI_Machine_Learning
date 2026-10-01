// 1. إعدادات مشروعك في Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCuL1tdpera0wkSeSHyT0U1uSyTmnIChxA",
    authDomain: "optical-manager-1056e.firebaseapp.com",
    projectId: "optical-manager-1056e",
    storageBucket: "optical-manager-1056e.firebasestorage.app",
    messagingSenderId: "36968228487",
    appId: "1:36968228487:web:a297699a55a99765f23a22",
    measurementId: "G-1YSKQ1GMFW"
};

// 2. تهيئة الاتصال بقاعدة البيانات وتفعيل العمل أوفلاين (Offline Persistence)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    console.log("Offline mode status:", err.code);
});

const recordsCollection = db.collection('optic_records');

// مصفوفة عامة لتخزين الكشوفات الحالية لاستخدامها عند التصدير لـ Excel
let currentRecordsList = [];

document.addEventListener('DOMContentLoaded', () => {
    const opticsForm = document.getElementById('opticsForm');
    const recordsTableBody = document.getElementById('recordsTableBody');
    const notesTextarea = document.getElementById('notes');
    const tagButtons = document.querySelectorAll('.tag-btn');
    const searchInput = document.getElementById('searchInput');
    const submitBtnText = document.getElementById('submitBtnText');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const dateInput = document.getElementById('date');

    let editingId = null;

    // 1. تعيين تاريخ اليوم تلقائياً
    resetDateToToday();

    // 2. الاستماع اللحظي للبيانات من الكاش المحلي (أوفلاين وأونلاين)
    listenToRecords();

    // 3. البحث والتصفية اللحظية
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim().toLowerCase();
            renderTable(searchTerm);
        });
    }

    // 4. الخيارات السريعة للملاحظات
    tagButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tagText = button.textContent;
            if (notesTextarea.value.trim() !== '') {
                notesTextarea.value += ' - ' + tagText;
            } else {
                notesTextarea.value = tagText;
            }
        });
    });

    // 5. حفظ الكشف أو تحديثه (مسح الفورم + إظهار الإشعار + التحديث)
    if (opticsForm) {
        opticsForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const clientName = document.getElementById('client').value.trim();
            if (!clientName) {
                alert('برجاء كتابة اسم العميل على الأقل لحفظ الكشف!');
                return;
            }

            const recordData = {
                date: document.getElementById('date').value || new Date().toISOString().split('T')[0],
                doctor: document.getElementById('doctor').value || '-',
                client: clientName,
                phone: document.getElementById('phone').value || '-',
                rightEye: {
                    sph: document.getElementById('right_sph').value || '-',
                    cyl: document.getElementById('right_cyl').value || '-',
                    axis: document.getElementById('right_axis').value || '-',
                    add: document.getElementById('right_add').value || '-'
                },
                leftEye: {
                    sph: document.getElementById('left_sph').value || '-',
                    cyl: document.getElementById('left_cyl').value || '-',
                    axis: document.getElementById('left_axis').value || '-',
                    add: document.getElementById('left_add').value || '-'
                },
                pd: document.getElementById('pd').value || '-',
                notes: notesTextarea.value || '-'
            };

            if (editingId !== null) {
                // تحديث كشف حالي
                recordsCollection.doc(editingId).update(recordData).then(() => {
                    showToast('تم تحديث بيانات الكشف بنجاح! ✏️');
                    clearFormAndReset();
                }).catch(err => alert('حدث خطأ أثناء التعديل!'));
            } else {
                // إضافة كشف جديد
                recordData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                recordsCollection.add(recordData).then(() => {
                    showToast('تم حفظ الكشف في السجل بنجاح! ✨');
                    clearFormAndReset();
                }).catch(err => alert('حدث خطأ أثناء الحفظ!'));
            }
        });
    }

    // زر إلغاء التعديل
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            clearFormAndReset();
            showToast('تم إلغاء التعديل.');
        });
    }

    // زر الطباعة
    const printBtn = document.getElementById('printBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // زر تصدير سجل الكشوفات لملف Excel
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportToExcel);
    }

    // دالة مسح إدخالات النموذج وإعادتها للوضع الافتراضي
    function clearFormAndReset() {
        if (opticsForm) opticsForm.reset();
        resetDateToToday();
        resetEditingState();
    }

    function resetDateToToday() {
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }
    }

    // دالة الاستماع اللحظي للبيانات أوفلاين/أونلاين
    function listenToRecords() {
        recordsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">جاري تحميل البيانات... ⏳</td></tr>';

        recordsCollection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
            currentRecordsList = [];
            snapshot.forEach((doc) => {
                currentRecordsList.push({ id: doc.id, ...doc.data() });
            });

            const filterTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
            renderTable(filterTerm);
        }, (error) => {
            console.error("خطأ في جلب البيانات:", error);
            recordsTableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">حدث خطأ أثناء جلب البيانات!</td></tr>';
        });
    }

    // دالة عرض الكشوفات في الجدول
    function renderTable(filterTerm = '') {
        recordsTableBody.innerHTML = '';

        const filteredRecords = currentRecordsList.filter(rec => {
            const clientMatch = rec.client ? rec.client.toLowerCase().includes(filterTerm) : false;
            const phoneMatch = rec.phone ? rec.phone.toLowerCase().includes(filterTerm) : false;
            return clientMatch || phoneMatch;
        });

        if (filteredRecords.length === 0) {
            recordsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">
                        ${filterTerm ? 'لا توجد نتائج مطابقة للبحث.' : 'لا توجد كشوفات محفوظة حالياً.'}
                    </td>
                </tr>
            `;
            return;
        }

        filteredRecords.forEach(rec => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${rec.date || '-'}</td>
                <td><strong>${rec.client || '-'}</strong></td>
                <td>${rec.phone || '-'}</td>
                <td>${rec.doctor || '-'}</td>
                <td><small>SPH:</small>${rec.rightEye?.sph || '-'} | <small>CYL:</small>${rec.rightEye?.cyl || '-'} | <small>AXIS:</small>${rec.rightEye?.axis || '-'}</td>
                <td><small>SPH:</small>${rec.leftEye?.sph || '-'} | <small>CYL:</small>${rec.leftEye?.cyl || '-'} | <small>AXIS:</small>${rec.leftEye?.axis || '-'}</td>
                <td>
                    <div class="action-btns">
                        <button class="view-btn" type="button" onclick="accessRecord('${rec.id}')">
                            <i class="fa-solid fa-eye"></i> عرض
                        </button>
                        <button class="edit-btn" type="button" onclick="editRecord('${rec.id}')">
                            <i class="fa-solid fa-pen"></i> تعديل
                        </button>
                        <button class="delete-btn" type="button" onclick="deleteRecord('${rec.id}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            recordsTableBody.appendChild(tr);
        });
    }

    // دالة تصدير البيانات الشاملة إلى Excel بدون إنترنت
    function exportToExcel() {
        if (typeof XLSX === 'undefined') {
            alert('مكتبة Excel غير محمّلة، تأكدي من الاتصال بالإنترنت مرة واحدة لتحميلها!');
            return;
        }

        if (currentRecordsList.length === 0) {
            alert('لا توجد كشوفات محفوظة حالياً لتصديرها!');
            return;
        }

        // تجهيز كل بيانات الكشف في أعمدة واضحة ومقروءة
        const formattedData = currentRecordsList.map(rec => ({
            "التاريخ": rec.date || '',
            "اسم العميل": rec.client || '',
            "رقم الهاتف": rec.phone || '',
            "الطبيب المعالج": rec.doctor || '',
            "يمين - SPH": rec.rightEye?.sph || '-',
            "يمين - CYL": rec.rightEye?.cyl || '-',
            "يمين - AXIS": rec.rightEye?.axis || '-',
            "يمين - ADD": rec.rightEye?.add || '-',
            "يسار - SPH": rec.leftEye?.sph || '-',
            "يسار - CYL": rec.leftEye?.cyl || '-',
            "يسار - AXIS": rec.leftEye?.axis || '-',
            "يسار - ADD": rec.leftEye?.add || '-',
            "البُعد بين الحدقتين (PD)": rec.pd || '-',
            "ملاحظات": rec.notes || '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "كشوفات النظارات");

        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `سجل_كشوفات_النظارات_${today}.xlsx`);
    }

    // دالات النافذة (Global Window Functions)
    window.accessRecord = function(id) {
        const docData = currentRecordsList.find(r => r.id === id);
        if (docData) {
            populateForm(docData);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast(`تم عرض كشف العميل: ${docData.client}`);
        }
    };

    window.editRecord = function(id) {
        const docData = currentRecordsList.find(r => r.id === id);
        if (docData) {
            populateForm(docData);
            editingId = id;
            if (submitBtnText) submitBtnText.textContent = 'تحديث بيانات الكشف';
            if (cancelEditBtn) cancelEditBtn.style.display = 'inline-flex';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            showToast('وضع التعديل مفعل الآن ✏️');
        }
    };

    function populateForm(rec) {
        document.getElementById('date').value = rec.date || '';
        document.getElementById('doctor').value = rec.doctor !== '-' ? rec.doctor : '';
        document.getElementById('client').value = rec.client || '';
        document.getElementById('phone').value = rec.phone !== '-' ? rec.phone : '';

        document.getElementById('right_sph').value = rec.rightEye?.sph !== '-' ? rec.rightEye.sph : '';
        document.getElementById('right_cyl').value = rec.rightEye?.cyl !== '-' ? rec.rightEye.cyl : '';
        document.getElementById('right_axis').value = rec.rightEye?.axis !== '-' ? rec.rightEye.axis : '';
        document.getElementById('right_add').value = rec.rightEye?.add !== '-' ? rec.rightEye.add : '';

        document.getElementById('left_sph').value = rec.leftEye?.sph !== '-' ? rec.leftEye.sph : '';
        document.getElementById('left_cyl').value = rec.leftEye?.cyl !== '-' ? rec.leftEye.cyl : '';
        document.getElementById('left_axis').value = rec.leftEye?.axis !== '-' ? rec.leftEye.axis : '';
        document.getElementById('left_add').value = rec.leftEye?.add !== '-' ? rec.leftEye.add : '';

        document.getElementById('pd').value = rec.pd !== '-' ? rec.pd : '';
        document.getElementById('notes').value = rec.notes !== '-' ? rec.notes : '';
    }

    function resetEditingState() {
        editingId = null;
        if (submitBtnText) submitBtnText.textContent = 'حفظ الكشف في النظام';
        if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    }

    window.deleteRecord = function(id) {
        if (confirm('هل أنت متأكد من حذف هذا الكشف؟')) {
            recordsCollection.doc(id).delete().then(() => {
                if (editingId === id) {
                    clearFormAndReset();
                }
                showToast('تم حذف الكشف بنجاح! 🗑️');
            }).catch(err => alert('حدث خطأ أثناء الحذف!'));
        }
    };
});

// دالة عرض إشعار التوست (متوافقة تماماً مع الـ CSS الخاص بكِ)
function showToast(message) {
    let toast = document.getElementById('toast');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${message}</span>`;
    toast.classList.add('show');
    
    setTimeout(() => { 
        toast.classList.remove('show'); 
    }, 3000);
}