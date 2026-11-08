/* SM EDUCATION v2.8.2 — exam design controls, marking rubrics and non-repeating paper selection. */
(function(){
 'use strict';
 const VERSION='2.8.2';
 window.SM_EDUCATION_RELEASE={version:VERSION,features:['visual-math-quality-workflow','term-1-2-3-exam-simulation','curriculum-exact-exam-selection','difficulty-duration-and-mark-controls','student-and-teacher-paper-versions','model-answer-and-marking-rubric','recent-question-deduplication','balanced-question-selection']};
 window.smEducationExamCapabilities=()=>({terms:[1,2,3],difficulty:['mixed','easy','medium','hard'],durationMinutes:{min:15,max:240},totalPoints:{min:10,max:40},recentQuestionDeduplication:true,exactGradeSubjectTermLanguage:true,teacherReviewRequired:true,officialExam:false});
})();
