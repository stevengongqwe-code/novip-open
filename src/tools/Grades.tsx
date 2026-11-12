import { useState, useMemo } from 'react';
import { ToolPage } from './common';
import { copyLocal } from '../tool-common';
import { useI18n } from '../i18n';
import {
  GPA_SCALES,
  SAMPLE_COURSES,
  calculateFinalExamNeeded,
  calculateGpaSummary,
  parseCoursesText,
  formatGpaReport,
  type GpaScaleKey,
  type CourseEntry,
  type FinalExamCalcResult,
} from './grades-core';
import {
  Award,
  Calculator,
  Check,
  Copy,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  FileText,
  TrendingUp,
  Target,
  ShieldCheck,
} from 'lucide-react';

export default function Grades() {
  const { lang } = useI18n();
  const isEn = lang === 'en-US';
  const [activeTab, setActiveTab] = useState<'exam' | 'gpa'>('exam');

  // --- Tab 1: 期末反推 ---
  const [usualScore, setUsualScore] = useState<string>('82');
  const [usualWeight, setUsualWeight] = useState<number>(30);
  const [targetScore, setTargetScore] = useState<string>('60');
  const [copiedExam, setCopiedExam] = useState<boolean>(false);

  const examResult: FinalExamCalcResult | null = useMemo(() => {
    const u = parseFloat(usualScore);
    const t = parseFloat(targetScore);
    if (isNaN(u) || isNaN(t)) return null;
    try {
      return calculateFinalExamNeeded(u, usualWeight, t);
    } catch {
      return null;
    }
  }, [usualScore, usualWeight, targetScore]);

  // --- Tab 2: GPA 计算器 ---
  const [scaleKey, setScaleKey] = useState<GpaScaleKey>('standard-4');
  const [courses, setCourses] = useState<CourseEntry[]>(SAMPLE_COURSES);
  const [batchText, setBatchText] = useState<string>('');
  const [showBatchModal, setShowBatchModal] = useState<boolean>(false);
  const [copiedGpa, setCopiedGpa] = useState<boolean>(false);

  const gpaSummary = useMemo(() => {
    return calculateGpaSummary(courses, scaleKey);
  }, [courses, scaleKey]);

  // 课程管理
  const addCourse = () => {
    setCourses((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        name: `新课程 ${prev.length + 1}`,
        score: 85,
        credits: 3.0,
      },
    ]);
  };

  const updateCourse = (id: string, field: keyof CourseEntry, value: string | number) => {
    setCourses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const removeCourse = (id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  };

  const handleApplyBatch = () => {
    const parsed = parseCoursesText(batchText);
    if (parsed.length > 0) {
      setCourses(parsed);
      setShowBatchModal(false);
      setBatchText('');
    }
  };

  const copyExamText = async () => {
    if (!examResult) return;
    const text = `🎯 【期末成绩反推测算】
• 平时成绩：${examResult.usualScore} 分（占比 ${examResult.usualWeightPercent}%，已锁定卷面 ${examResult.usualContribution} 分）
• 目标总评：${examResult.targetScore} 分
• 期末卷面需考：${examResult.neededExamScore} 分（期末考试占比 ${examResult.examWeightPercent}%）
• 及格保底需考：${examResult.neededForPass60} 分
• 冲优(85分)需考：${examResult.neededForExcellent85} 分
• 备考建议：${examResult.tip}
（测算来源：NOVIP 大学工具箱 novip.site）`;
    try {
      await copyLocal(text);
      setCopiedExam(true);
      setTimeout(() => setCopiedExam(false), 2500);
    } catch {}
  };

  const copyGpaText = async () => {
    const text = formatGpaReport(gpaSummary, GPA_SCALES[scaleKey].name);
    try {
      await copyLocal(text);
      setCopiedGpa(true);
      setTimeout(() => setCopiedGpa(false), 2500);
    } catch {}
  };

  return (
    <ToolPage
      id="grades"
      title={isEn ? "Final Exam Target & GPA Calculator" : "期末考分反推 & 大学学分绩点 (GPA)"}
      description={
        isEn
          ? "Calculate minimum final exam score needed to pass, and compute cumulative GPA for scholarship and grad school. 100% In-Browser."
          : "平时分反推期末要考多少分不挂科、算奖学金与保研 GPA 绩点。纯端侧严谨计算，数据绝不上传。"
      }
    >
      {/* 顶部主切换 Tab */}
      <div className="novip-grades-tabs" role="tablist" aria-label={isEn ? "Feature tabs" : "功能切换"}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'exam'}
          className={`novip-grades-tab ${activeTab === 'exam' ? 'active' : ''}`}
          onClick={() => setActiveTab('exam')}
        >
          <Target size={18} />
          <span>{isEn ? '🎯 Final Exam Score Needed / Pass Target' : '🎯 期末考多少分不挂科 / 成绩反推'}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'gpa'}
          className={`novip-grades-tab ${activeTab === 'gpa' ? 'active' : ''}`}
          onClick={() => setActiveTab('gpa')}
        >
          <Award size={18} />
          <span>{isEn ? '📊 College GPA Calculator' : '📊 大学学分绩点 (GPA) 计算器'}</span>
        </button>
      </div>

      {activeTab === 'exam' ? (
        /* =================== TAB 1: 期末成绩反推 =================== */
        <div className="novip-grades-panel" aria-label={isEn ? "Final exam target calculation" : "期末成绩反推"}>
          <div className="novip-grades-layout">
            {/* 左侧：输入表单 */}
            <div className="novip-card-box">
              <div className="novip-card-head">
                <Calculator size={18} className="novip-icon-primary" />
                <h3>{isEn ? 'Enter Your Scores & Targets' : '输入你的成绩与目标'}</h3>
              </div>

              {/* 1. 平时成绩 */}
              <div className="novip-form-group">
                <div className="novip-form-label-row">
                  <label htmlFor="usual-score">{isEn ? 'Continuous Assessment (Out of 100)' : '平时成绩（满分 100）'}</label>
                  <span className="novip-badge-hint">{isEn ? 'Homework, attendance, midterm' : '作业、考勤、期中综合'}</span>
                </div>
                <input
                  id="usual-score"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  className="novip-input-field"
                  value={usualScore}
                  onChange={(e) => setUsualScore(e.target.value)}
                  placeholder={isEn ? "e.g. 85" : "如：85"}
                />
              </div>

              {/* 2. 平时成绩权重 */}
              <div className="novip-form-group">
                <div className="novip-form-label-row">
                  <label>{isEn ? 'Continuous Assessment Weight' : '平时成绩占比'}</label>
                  <span className="novip-badge-hint">
                    {isEn ? `Final exam weight: ${100 - usualWeight}%` : `期末卷面占比 ${100 - usualWeight}%`}
                  </span>
                </div>
                <div className="novip-chip-selector" role="radiogroup" aria-label={isEn ? "Continuous assessment weight" : "平时成绩占比"}>
                  {[20, 30, 40, 50, 60].map((w) => (
                    <button
                      key={w}
                      type="button"
                      className={`novip-chip-btn ${usualWeight === w ? 'selected' : ''}`}
                      onClick={() => setUsualWeight(w)}
                    >
                      {w}%
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. 目标总评 */}
              <div className="novip-form-group">
                <div className="novip-form-label-row">
                  <label htmlFor="target-score">{isEn ? 'Target Course Grade' : '目标总评总分'}</label>
                  <span className="novip-badge-hint">{isEn ? 'Overall score you aim to achieve' : '你期末期望的总评成绩'}</span>
                </div>
                <input
                  id="target-score"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  className="novip-input-field"
                  value={targetScore}
                  onChange={(e) => setTargetScore(e.target.value)}
                  placeholder={isEn ? "e.g. 60 or 85" : "如：60 或 85"}
                />
                <div className="novip-quick-targets">
                  <span className="novip-quick-label">{isEn ? 'Quick Targets: ' : '快捷目标：'}</span>
                  {[
                    { label: isEn ? '60 (Pass)' : '60分 (及格不挂科)', val: '60' },
                    { label: isEn ? '70 (Average)' : '70分 (中等)', val: '70' },
                    { label: isEn ? '80 (Good)' : '80分 (良好)', val: '80' },
                    { label: isEn ? '85 (Honors)' : '85分 (评优)', val: '85' },
                    { label: isEn ? '90 (Top Tier)' : '90分 (保研)', val: '90' },
                  ].map((t) => (
                    <button
                      key={t.val}
                      type="button"
                      className="novip-quick-target-btn"
                      onClick={() => setTargetScore(t.val)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="novip-privacy-note">
                <ShieldCheck size={14} />
                <span>{isEn ? '100% In-Browser. No data uploaded. Cleared on refresh.' : '计算完全在手机/电脑本地运行，数据不上传，刷新即清空'}</span>
              </div>
            </div>

            {/* 右侧：结果卡片 */}
            <div className="novip-card-box novip-result-box">
              <div className="novip-card-head">
                <TrendingUp size={18} className="novip-icon-accent" />
                <h3>{isEn ? 'Calculation Result & Study Advice' : '测算结果与复习建议'}</h3>
              </div>

              {examResult ? (
                <div className="novip-exam-result-display">
                  {/* 主英雄大数字 */}
                  <div className={`novip-hero-score-badge ${examResult.difficulty}`}>
                    <div className="novip-hero-score-label">{isEn ? 'Final Exam Score Required' : '期末卷面需要考'}</div>
                    <div className="novip-hero-score-num">
                      {examResult.alreadyEnough
                        ? (isEn ? 'Already Passed' : '无需考分')
                        : examResult.possible
                        ? (isEn ? `${examResult.neededExamScore} pts` : `${examResult.neededExamScore} 分`)
                        : (isEn ? 'Impossible' : '无法达标')}
                    </div>
                    <div className="novip-hero-score-desc">{examResult.tip}</div>
                  </div>

                  {/* 详细指标清单 */}
                  <div className="novip-exam-metrics-list">
                    <div className="novip-metric-row">
                      <span>{isEn ? 'Continuous Assessment Contribution' : '平时成绩锁定贡献'}</span>
                      <strong>{examResult.usualContribution} {isEn ? 'pts' : '分'}</strong>
                    </div>
                    <div className="novip-metric-row">
                      <span>{isEn ? 'Final Exam Weight' : '期末卷面占比'}</span>
                      <strong>{examResult.examWeightPercent}%</strong>
                    </div>
                    <div className="novip-metric-row">
                      <span>{isEn ? 'Score Needed for Passing (60)' : '及格保底 (60分) 卷面需考'}</span>
                      <strong className={examResult.neededForPass60 <= 60 ? 'text-green' : 'text-orange'}>
                        {examResult.neededForPass60 <= 0
                          ? (isEn ? 'Already passed from coursework' : '平时已够及格')
                          : (isEn ? `${examResult.neededForPass60} pts` : `${examResult.neededForPass60} 分`)}
                      </strong>
                    </div>
                    <div className="novip-metric-row">
                      <span>{isEn ? 'Score Needed for Honors (85)' : '冲优优异 (85分) 卷面需考'}</span>
                      <strong className={examResult.neededForExcellent85 <= 100 ? 'text-blue' : 'text-red'}>
                        {examResult.neededForExcellent85 > 100
                          ? (isEn ? 'Unreachable (>100)' : '不可达 (需>100)')
                          : (isEn ? `${examResult.neededForExcellent85} pts` : `${examResult.neededForExcellent85} 分`)}
                      </strong>
                    </div>
                  </div>

                  {/* 复制操作闭环 */}
                  <div className="novip-action-row">
                    <button
                      type="button"
                      className={`novip-btn-tactile ${copiedExam ? 'novip-btn-tactile--success' : 'novip-btn-tactile--primary'}`}
                      onClick={copyExamText}
                    >
                      {copiedExam ? <Check size={16} /> : <Copy size={16} />}
                      <span>
                        {copiedExam
                          ? (isEn ? '✓ Copied to clipboard!' : '✓ 已复制到剪贴板！')
                          : (isEn ? 'Copy Calculation Summary' : '一键复制测算总结')}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="novip-empty-hint">
                  {isEn ? 'Please enter valid scores and target to calculate.' : '请输入有效的平时成绩和目标分数开始计算。'}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* =================== TAB 2: GPA 学分绩点计算器 =================== */
        <div className="novip-grades-panel" aria-label="GPA 学分绩点计算">
          {/* 算法选择与工具栏 */}
          <div className="novip-card-box novip-gpa-settings-bar">
            <div className="novip-gpa-scale-select-group">
              <label htmlFor="gpa-scale-select">
                <strong>{isEn ? 'GPA Scale System:' : '绩点算法体系：'}</strong>
              </label>
              <select
                id="gpa-scale-select"
                className="novip-select-field"
                value={scaleKey}
                onChange={(e) => setScaleKey(e.target.value as GpaScaleKey)}
              >
                {Object.values(GPA_SCALES).map((scale) => (
                  <option key={scale.key} value={scale.key}>
                    {scale.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="novip-scale-desc">
              <span>{GPA_SCALES[scaleKey].description}</span>
            </div>
            <div className="novip-gpa-actions-bar">
              <button
                type="button"
                className="novip-btn-compact"
                onClick={() => setCourses(SAMPLE_COURSES)}
              >
                <Sparkles size={14} />
                <span>{isEn ? 'Load Sample Courses' : '载入大二成绩示例'}</span>
              </button>
              <button
                type="button"
                className="novip-btn-compact"
                onClick={() => setShowBatchModal(true)}
              >
                <FileText size={14} />
                <span>{isEn ? 'Import Text' : '批量导入文本'}</span>
              </button>
              <button
                type="button"
                className="novip-btn-compact text-red"
                onClick={() => setCourses([])}
              >
                <RotateCcw size={14} />
                <span>{isEn ? 'Clear Courses' : '清空课程'}</span>
              </button>
            </div>
          </div>

          <div className="novip-grades-layout">
            {/* 左侧：课程列表 */}
            <div className="novip-card-box">
              <div className="novip-card-head">
                <FileText size={18} className="novip-icon-primary" />
                <h3>{isEn ? `Courses List (${courses.length})` : `课程成绩清单 (${courses.length} 门)`}</h3>
                <button
                  type="button"
                  className="novip-add-course-btn"
                  onClick={addCourse}
                  title={isEn ? "Add a new course" : "添加一门新课程"}
                >
                  <Plus size={14} />
                  <span>{isEn ? 'Add Course' : '加一门'}</span>
                </button>
              </div>

              {courses.length === 0 ? (
                <div className="novip-empty-hint">
                  {isEn
                    ? 'No courses yet. Click "Add Course" or "Load Sample Courses" to start.'
                    : '暂无课程数据，请点击上方「加一门」或「载入大二成绩示例」开始测算。'}
                </div>
              ) : (
                <div className="novip-courses-table-wrap">
                  <table className="novip-courses-table">
                    <thead>
                      <tr>
                        <th>{isEn ? 'Course Name' : '课程名称'}</th>
                        <th style={{ width: 85 }}>{isEn ? 'Score' : '成绩'}</th>
                        <th style={{ width: 80 }}>{isEn ? 'Credits' : '学分'}</th>
                        <th style={{ width: 75 }}>{isEn ? 'GPA' : '折算绩点'}</th>
                        <th style={{ width: 45 }}>{isEn ? 'Action' : '操作'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gpaSummary.courses.map((course) => (
                        <tr key={course.id}>
                          <td>
                            <input
                              type="text"
                              className="novip-table-input"
                              value={course.name}
                              onChange={(e) => updateCourse(course.id, 'name', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              className="novip-table-input"
                              value={course.score}
                              onChange={(e) => updateCourse(course.id, 'score', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0.5"
                              max="20"
                              step="0.5"
                              className="novip-table-input"
                              value={course.credits}
                              onChange={(e) => updateCourse(course.id, 'credits', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="text-center font-bold font-mono">
                            {course.point.toFixed(2)}
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="novip-icon-del-btn"
                              onClick={() => removeCourse(course.id)}
                              aria-label={isEn ? "Delete this course" : "删除此门课程"}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 右侧：GPA 核心成果卡片 */}
            <div className="novip-card-box novip-result-box">
              <div className="novip-card-head">
                <Award size={18} className="novip-icon-accent" />
                <h3>{isEn ? 'Academic Standing & GPA' : 'GPA 综合学业评定'}</h3>
              </div>

              {gpaSummary.totalCredits > 0 ? (
                <div className="novip-gpa-summary-card">
                  {/* 主 GPA 徽章 */}
                  <div className="novip-gpa-hero-badge">
                    <div className="novip-gpa-hero-label">{isEn ? 'Grade Point Average (GPA)' : '平均学分绩点 (GPA)'}</div>
                    <div className="novip-gpa-hero-value">
                      {gpaSummary.weightedGpa.toFixed(2)}
                      <span className="novip-gpa-max-tag"> / {gpaSummary.scaleMaxPoint.toFixed(1)}</span>
                    </div>
                    <div className="novip-gpa-standing-pill">{gpaSummary.standing}</div>
                  </div>

                  {/* 关键统计指标 */}
                  <div className="novip-gpa-stats-grid">
                    <div className="novip-gpa-stat-box">
                      <span className="novip-stat-label">{isEn ? 'Weighted Average' : '加权平均分'}</span>
                      <strong className="novip-stat-num">{gpaSummary.weightedAverageScore.toFixed(2)}</strong>
                    </div>
                    <div className="novip-gpa-stat-box">
                      <span className="novip-stat-label">{isEn ? 'Arithmetic Mean' : '算术平均分'}</span>
                      <strong className="novip-stat-num">{gpaSummary.arithmeticMeanScore.toFixed(2)}</strong>
                    </div>
                    <div className="novip-gpa-stat-box">
                      <span className="novip-stat-label">{isEn ? 'Total Credits' : '修读总学分'}</span>
                      <strong className="novip-stat-num">{gpaSummary.totalCredits.toFixed(1)}</strong>
                    </div>
                    <div className="novip-gpa-stat-box">
                      <span className="novip-stat-label">{isEn ? 'Earned (≥60)' : '已获学分 (≥60分)'}</span>
                      <strong className="novip-stat-num text-green">{gpaSummary.passedCredits.toFixed(1)}</strong>
                    </div>
                  </div>

                  {/* 复制与导出操作 */}
                  <div className="novip-action-row" style={{ marginTop: 20 }}>
                    <button
                      type="button"
                      className={`novip-btn-tactile ${copiedGpa ? 'novip-btn-tactile--success' : 'novip-btn-tactile--primary'}`}
                      onClick={copyGpaText}
                    >
                      {copiedGpa ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copiedGpa ? (isEn ? '✓ Transcript report copied!' : '✓ 成绩单报告已复制！') : (isEn ? '📋 Copy Standard GPA Summary' : '📋 复制标准成绩单摘要')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="novip-empty-hint">{isEn ? 'Please add at least one course to compute GPA.' : '请录入至少一门课程以生成综合 GPA。'}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 批量导入 Modal */}
      {showBatchModal && (
        <div className="novip-modal-overlay" role="dialog" aria-modal="true" aria-label={isEn ? "Batch import courses" : "批量导入课程"}>
          <div className="novip-modal-card">
            <div className="novip-modal-head">
              <h4>{isEn ? '📝 Batch Import Course Scores' : '📝 批量导入课程成绩'}</h4>
              <button
                type="button"
                className="novip-modal-close"
                onClick={() => setShowBatchModal(false)}
              >
                ✕
              </button>
            </div>
            <p className="novip-modal-hint">
              {isEn
                ? 'Copy and paste from Excel or school portal, one course per line. Formats supported:'
                : '可直接从教务系统或 Excel 复制，每行一门课程，格式支持：'}
              <br />
              <code>{isEn ? 'CourseName Score Credits' : '课程名称 成绩 学分'}</code> {isEn ? 'or' : '或'} <code>{isEn ? 'Score, Credits' : '成绩, 学分'}</code>
            </p>
            <textarea
              className="novip-modal-textarea"
              rows={6}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={isEn ? "e.g.:\nAdvanced Mathematics 88 4.0\nCollege Physics 76 3.0\nEnglish Writing 92 2.0" : "例如：\n高等数学 88 4.0\n大学物理 76 3.0\n英语写作 92 2.0"}
            />
            <div className="novip-modal-footer">
              <button
                type="button"
                className="novip-btn-compact"
                onClick={() => setShowBatchModal(false)}
              >
                {isEn ? 'Cancel' : '取消'}
              </button>
              <button
                type="button"
                className="novip-btn-tactile novip-btn-tactile--primary"
                onClick={handleApplyBatch}
              >
                {isEn ? 'Parse & Import' : '确认解析导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToolPage>
  );
}
