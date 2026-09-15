import { useState, useEffect } from 'react';
import { adminApi } from '../../api/admin';
import type { School, Faculty, Department, Class, Course } from '../../types';
import TopBar from '../../components/layout/TopBar';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Spinner from '../../components/ui/Spinner';

type ActiveTab = 'schools' | 'faculties' | 'departments' | 'classes' | 'courses';

export default function InstitutionsPage() {
  const [tab, setTab] = useState<ActiveTab>('schools');

  const [schools, setSchools] = useState<School[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, f, d, cl, co] = await Promise.all([
        adminApi.getSchools(),
        adminApi.getFaculties(),
        adminApi.getDepartments(),
        adminApi.getClasses(),
        adminApi.getCourses(),
      ]);
      setSchools(s);
      setFaculties(f);
      setDepartments(d);
      setClasses(cl);
      setCourses(co);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const openCreate = () => { setEditId(null); setForm({}); setModalOpen(true); };

  const openEdit = (id: string, data: Record<string, string>) => {
    setEditId(id);
    setForm(data);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      if (tab === 'schools') await adminApi.deleteSchool(id);
      else if (tab === 'faculties') await adminApi.deleteFaculty(id);
      else if (tab === 'departments') await adminApi.deleteDepartment(id);
      else if (tab === 'classes') await adminApi.deleteClass(id);
      else await adminApi.deleteCourse(id);
      loadAll();
    } catch { alert('Failed to delete.'); }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (tab === 'schools') {
        editId ? await adminApi.updateSchool(editId, { name: form.name }) : await adminApi.createSchool({ name: form.name });
      } else if (tab === 'faculties') {
        editId ? await adminApi.updateFaculty(editId, { name: form.name, school_id: form.school_id }) : await adminApi.createFaculty({ name: form.name, school_id: form.school_id });
      } else if (tab === 'departments') {
        editId ? await adminApi.updateDepartment(editId, { name: form.name, faculty_id: form.faculty_id }) : await adminApi.createDepartment({ name: form.name, faculty_id: form.faculty_id });
      } else if (tab === 'classes') {
        editId ? await adminApi.updateClass(editId, { name: form.name, department_id: form.department_id, academic_year: form.academic_year }) : await adminApi.createClass({ name: form.name, department_id: form.department_id, academic_year: form.academic_year });
      } else {
        editId ? await adminApi.updateCourse(editId, { code: form.code, name: form.name, department_id: form.department_id }) : await adminApi.createCourse({ code: form.code, name: form.name, department_id: form.department_id });
      }
      setModalOpen(false);
      loadAll();
    } catch { alert('Failed to save.'); }
    finally { setSaving(false); }
  };

  const tabs: ActiveTab[] = ['schools', 'faculties', 'departments', 'classes', 'courses'];

  const actionCol = (id: string, data: Record<string, string>) => (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" onClick={() => openEdit(id, data)}>Edit</Button>
      <Button size="sm" variant="ghost" onClick={() => handleDelete(id)}>Delete</Button>
    </div>
  );

  const renderTable = () => {
    if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
    if (tab === 'schools')
      return <Table columns={[{ key: 'name', header: 'Name' }, { key: 'actions', header: 'Actions', render: (r: School) => actionCol(r.id, { name: r.name }) }]} data={schools} keyExtractor={r => r.id} emptyMessage="No schools." />;
    if (tab === 'faculties')
      return <Table columns={[{ key: 'name', header: 'Name' }, { key: 'school', header: 'School', render: (r: Faculty) => schools.find(s => s.id === r.school_id)?.name ?? r.school_id }, { key: 'actions', header: 'Actions', render: (r: Faculty) => actionCol(r.id, { name: r.name, school_id: r.school_id }) }]} data={faculties} keyExtractor={r => r.id} emptyMessage="No faculties." />;
    if (tab === 'departments')
      return <Table columns={[{ key: 'name', header: 'Name' }, { key: 'faculty', header: 'Faculty', render: (r: Department) => faculties.find(f => f.id === r.faculty_id)?.name ?? r.faculty_id }, { key: 'actions', header: 'Actions', render: (r: Department) => actionCol(r.id, { name: r.name, faculty_id: r.faculty_id }) }]} data={departments} keyExtractor={r => r.id} emptyMessage="No departments." />;
    if (tab === 'classes')
      return <Table columns={[{ key: 'name', header: 'Name' }, { key: 'academic_year', header: 'Year' }, { key: 'dept', header: 'Department', render: (r: Class) => departments.find(d => d.id === r.department_id)?.name ?? r.department_id }, { key: 'actions', header: 'Actions', render: (r: Class) => actionCol(r.id, { name: r.name, department_id: r.department_id, academic_year: r.academic_year }) }]} data={classes} keyExtractor={r => r.id} emptyMessage="No classes." />;
    return <Table columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Name' }, { key: 'dept', header: 'Department', render: (r: Course) => departments.find(d => d.id === r.department_id)?.name ?? r.department_id }, { key: 'actions', header: 'Actions', render: (r: Course) => actionCol(r.id, { code: r.code, name: r.name, department_id: r.department_id }) }]} data={courses} keyExtractor={r => r.id} emptyMessage="No courses." />;
  };

  const renderFormFields = () => {
    const f = (key: string, label: string, placeholder?: string) => (
      <Input key={key} label={label} value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} />
    );
    const sel = (key: string, label: string, options: { value: string; label: string }[]) => (
      <div key={key} className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <select value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Select…</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
    if (tab === 'schools') return [f('name', 'School Name', 'e.g. University of Cape Coast')];
    if (tab === 'faculties') return [f('name', 'Faculty Name'), sel('school_id', 'School', schools.map(s => ({ value: s.id, label: s.name })))];
    if (tab === 'departments') return [f('name', 'Department Name'), sel('faculty_id', 'Faculty', faculties.map(x => ({ value: x.id, label: x.name })))];
    if (tab === 'classes') return [f('name', 'Class Name'), f('academic_year', 'Academic Year', '2024/2025'), sel('department_id', 'Department', departments.map(d => ({ value: d.id, label: d.name })))];
    return [f('code', 'Course Code', 'e.g. CS101'), f('name', 'Course Name'), sel('department_id', 'Department', departments.map(d => ({ value: d.id, label: d.name })))];
  };

  return (
    <div>
      <TopBar title="Institutions" backTo="/admin" actions={<Button onClick={openCreate}>Add { tab.slice(0, -1)}</Button>} />
      <div className="p-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors focus:outline-none
                ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {renderTable()}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`${editId ? 'Edit' : 'Add'} ${tab.slice(0, -1)}`}>
        <div className="space-y-4">
          {renderFormFields()}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSubmit}>{editId ? 'Save Changes' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
