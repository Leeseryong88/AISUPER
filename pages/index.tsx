import { useState, useRef, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import styles from '../styles/Home.module.css';
import imageCompression from 'browser-image-compression';
import { ko } from 'date-fns/locale'; // 한국어 지원

interface DiaryEntry {
  id: string;
  date: string;
  diary: string;
  images: string[];  // 이미지 배열이 포함되어 있는지 확인
}

interface Question {
  key: string;
  text: string;
  answer: string;
}

interface PopupReport {
  isOpen: boolean;
  report: DiaryEntry | null;
}

interface ModalReport {
  isOpen: boolean;
  report: DiaryEntry | null;
}

// API 키 설정
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [diary, setDiary] = useState<string>('');
  const [savedEntries, setSavedEntries] = useState<DiaryEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [isTimeSelected, setIsTimeSelected] = useState(false);
  const [popup, setPopup] = useState<PopupReport>({ isOpen: false, report: null });
  const reportRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingReport, setEditingReport] = useState<DiaryEntry | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<ModalReport>({ isOpen: false, report: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editedDiary, setEditedDiary] = useState('');

  const questions = [
    { key: 'datetime', text: '점검 일시를 선택해주세요' },
    { key: 'location', text: '점검 장소는 어디입니까?' },
    { key: 'inspector', text: '점검자 및 참석자를 입력해주세요' },
    { key: 'purpose', text: '점검 목적은 무엇입니까?' },
    { key: 'findings', text: '주요 발견사항은 무엇입니까?' },
    { key: 'actions', text: '조치사항 및 권고사항을 입력해주세요' }
  ];

  const compressImage = async (file: File) => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1280,
      useWebWorker: true,
      fileType: file.type as string,
    };

    try {
      const compressedFile = await imageCompression(file, options);
      return compressedFile;
    } catch (error) {
      console.error('이미지 압축 중 오류:', error);
      throw error;
    }
  };

  const generateDiary = async () => {
    if (!previewImages.length) return;

    setLoading(true);
    setLoadingMessage('보고서 생성 중...');
    
    try {
      let imageAnalysis = '';

      // 이미지 분석 부분
      if (previewImages.length > 0) {
        setLoadingMessage('이미지 분석 중...');
        try {
          const imageResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: "이미지에서 안전과 관련된 위험요인을 분석해주세요. 위험요인이 없다면 '특이사항 없음'이라고 답변해주세요."
                }, {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: previewImages[0].split(',')[1]
                  }
                }]
              }]
            })
          });

          if (!imageResponse.ok) {
            const errorData = await imageResponse.json();
            console.error('이미지 분석 상세 에러:', errorData);
            throw new Error(`이미지 분석 실패: ${errorData.error?.message || '알 수 없는 오류'}`);
          }

          const imageData = await imageResponse.json();
          imageAnalysis = imageData.candidates?.[0]?.content?.parts?.[0]?.text || '이미지 분석 실패';
        } catch (imageError) {
          console.error('이미지 분석 중 오류:', imageError);
          imageAnalysis = '이미지 분석을 진행할 수 없습니다.';
        }
      }

      // 보고서 생성 부분
      setLoadingMessage('보고서 생성 중...');
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `다음 정보를 바탕으로 공식적인 점검일지를 작성해주세요:

점검일지

이미지 분석 결과:
${imageAnalysis}

1. 점검 기본정보
- 점검일시: ${answers['datetime']}
- 점검장소: ${answers['location']}
- 점검자: ${answers['inspector']}
- 점검목적: ${answers['purpose']}

2. 점검 결과
${answers['findings']}

3. 조치사항
${answers['actions']}

다음 형식으로 작성해주세요:
- 각 섹션은 1, 2, 3과 같은 번호로 시작
- 세부 내용은 - 기호로 시작
- 공식적이고 명확한 어조 사용
- 중복된 내용 없이 작성`
            }]
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('보고서 생성 에러:', errorData);
        throw new Error('보고서 생성 요청 실패');
      }

      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!generatedText) {
        throw new Error('보고서 생성 결과가 없습니다');
      }

      setDiary(generatedText);
    } catch (error) {
      console.error('API 오류:', error);
      alert('보고서 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleNoImage = () => {
    setPreviewImages([]);
    setCurrentStep(0);
    setDiary('');
    setAnswers({});
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setCompressing(true);
    
    try {
      const processedImages = await Promise.all(
        files.map(async (file) => {
          const compressedFile = await compressImage(file);
          const reader = new FileReader();
          return new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(compressedFile);
          });
        })
      );
      
      setPreviewImages(prev => [...prev, ...processedImages]);
    } catch (error) {
      console.error('이미지 처리 중 오류:', error);
      alert('이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setCompressing(false);
    }
  };

  const handleImageSelect = () => {
    fileInputRef.current?.click();
  };

  const handleAnswer = (answer: string) => {
    setAnswers(prev => ({
      ...prev,
      [questions[currentStep].key]: answer
    }));
    
    if (currentStep < questions.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  // 마지막 질문에서 보고서 생성
  const handleLastQuestion = () => {
    handleAnswer(answers[questions[currentStep].key] || '');
    generateDiary();
  };

  // 컴포넌트 마운트 시 저장된 보고서 불러오기
  useEffect(() => {
    const savedData = localStorage.getItem('safetyReports');
    if (savedData) {
      setSavedEntries(JSON.parse(savedData));
    }
  }, []);

  // 초기화 함수 추가
  const resetForm = () => {
    setPreviewImages([]);
    setDiary('');
    setAnswers({});
    setCurrentStep(0);
    setSelectedDate(null);
  };

  // 보고서 저장 함수 수정
  const saveReport = () => {
    if (!selectedDate) return;
    
    const newEntry: DiaryEntry = {
      id: Date.now().toString(),
      date: selectedDate.toISOString(),
      diary: diary,
      images: previewImages
    };

    setSavedEntries(prev => [...prev, newEntry]);
    localStorage.setItem('safetyReports', JSON.stringify([...savedEntries, newEntry]));
    
    // 모든 상태 초기화
    setDiary('');
    setSelectedDate(null);
    setPreviewImages([]);
    setImages([]); // 처리된 이미지 배열 초기화
    setCurrentStep(0); // 설문 단계 초기화
    setAnswers({}); // 설문 답변 초기화
    setLoadingMessage(''); // 로딩 메시지 초기화
    setCompressing(false); // 압축 상태 초기화
    
    // 파일 입력 필드 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // 성공 메시지 표시
    alert('보고서가 저장되었습니다.');
  };

  // PDF 생성 함수 수정
  const generatePDF = async (report: DiaryEntry) => {
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">안전점검 보고서</h1>
        <p style="margin-bottom: 16px;">작성일: ${new Date(report.date).toLocaleDateString()}</p>
        
        ${report.images && report.images.length > 0 ? `
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 16px; margin-bottom: 8px;">현장 사진</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
              ${report.images.map((image, index) => `
                <img src="${image}" alt="현장 사진 ${index + 1}" style="width: 100%; object-fit: cover;">
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <div style="white-space: pre-wrap;">${report.diary}</div>
      </div>
    `;

    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const opt = {
        margin: 1,
        filename: `안전점검보고서_${new Date(report.date).toLocaleDateString()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('PDF 생성 중 오류:', error);
      alert('PDF 생성 중 오류가 발생했습니다.');
    }
  };

  // 보고서 수정 함수
  const handleEdit = () => {
    setEditMode(true);
    setEditedDiary(modal.report?.diary || '');
  };

  // 수정사항 저장 핸들러
  const handleSaveEdit = () => {
    const currentReport = modal.report;
    if (!currentReport) return;  // early return if null

    const updatedReport: DiaryEntry = {
      ...currentReport,
      diary: editedDiary
    };

    // 저장된 보고서 목록 업데이트
    const updatedEntries = savedEntries.map(entry =>
      entry.id === currentReport.id ? updatedReport : entry
    );

    setSavedEntries(updatedEntries);
    localStorage.setItem('safetyReports', JSON.stringify(updatedEntries));
    
    setEditMode(false);
    setModal({ isOpen: true, report: updatedReport });
    
    alert('수정사항이 저장되었습니다.');
  };

  // 컴포넌트가 언마운트될 때 URL 정리
  useEffect(() => {
    return () => {
      previewImages.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewImages]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-8">안전점검 보고서</h1>
      
      {/* 이미지 업로드와 질문 섹션은 diary가 없을 때만 표시 */}
      {!diary && (
        <>
          {/* 이미지 업로드 섹션 */}
          <div className="border-dashed border-2 border-gray-300 p-4 text-center">
            {previewImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 mb-4">
                {previewImages.map((url, index) => (
                  <div key={index} className="relative">
                    <img 
                      src={url} 
                      alt={`미리보기 ${index + 1}`} 
                      className="w-full h-48 object-cover rounded"
                    />
                    <button
                      onClick={() => {
                        setPreviewImages(prev => prev.filter((_, i) => i !== index));
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="mb-2">현장 사진을 업로드하세요</p>
                <p className="text-sm text-gray-500 mb-4">자동으로 5MB 이하로 최적화됩니다</p>
              </>
            )}
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              multiple
              className="hidden"
            />
            <button
              onClick={handleImageSelect}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              사진 선택
            </button>
          </div>

          {/* 질문 섹션 */}
          {currentStep < questions.length && (
            <div className="mt-8 space-y-6">
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-lg font-medium text-gray-800 mb-4">
                  {questions[currentStep].text}
                </h2>
                
                {questions[currentStep].key === 'datetime' ? (
                  <div className="space-y-4">
                    <DatePicker
                      selected={selectedDate}
                      onChange={(date: Date) => {
                        setSelectedDate(date);
                        handleAnswer(date.toLocaleDateString());
                      }}
                      locale={ko}
                      dateFormat="yyyy년 MM월 dd일"
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholderText="날짜를 선택하세요"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <input
                      type="text"
                      value={answers[questions[currentStep].key] || ''}
                      onChange={(e) => setAnswers(prev => ({
                        ...prev,
                        [questions[currentStep].key]: e.target.value
                      }))}
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="답변을 입력하세요"
                    />
                    <button
                      onClick={currentStep === questions.length - 1 ? handleLastQuestion : () => handleAnswer(answers[questions[currentStep].key] || '')}
                      className={`w-full px-6 py-3 text-white rounded-lg transition-colors duration-200
                        ${currentStep === questions.length - 1 
                          ? 'bg-green-500 hover:bg-green-600' 
                          : 'bg-blue-500 hover:bg-blue-600'}`}
                      disabled={!answers[questions[currentStep].key]}
                    >
                      {currentStep === questions.length - 1 ? '보고서 작성' : '다음'}
                    </button>
                  </div>
                )}
              </div>

              {/* 진행 상태 표시 */}
              <div className="flex justify-between items-center px-4">
                <div className="text-sm text-gray-500">
                  {currentStep + 1} / {questions.length}
                </div>
                <div className="w-full max-w-xs bg-gray-200 rounded-full h-2 ml-4">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 생성된 보고서 */}
      {diary && (
        <div className="mt-8 p-6 bg-white rounded-lg shadow-sm">
          <h2 className="text-lg font-medium mb-4">생성된 보고서</h2>
          <div className="whitespace-pre-wrap">{diary}</div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={resetForm}
              className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              취소
            </button>
            <button
              onClick={saveReport}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              보고서 저장
            </button>
          </div>
        </div>
      )}

      {/* 저장된 보고서 목록 */}
      {!diary && savedEntries.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-medium mb-6">저장된 보고서</h2>
          <div className="grid gap-6">
            {savedEntries.map((entry) => (
              <div 
                key={entry.id} 
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all 
                         cursor-pointer group"
                onClick={() => setModal({ isOpen: true, report: entry })}
              >
                <div className="flex items-start gap-4">
                  {entry.images && entry.images.length > 0 && (
                    <div className="w-32 h-32 flex-shrink-0">
                      <img
                        src={entry.images[0]}
                        alt="점검 현장"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-gray-500 text-sm">
                          {new Date(entry.date).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                        <h3 className="font-medium mt-1 group-hover:text-blue-600 transition-colors">
                          {entry.images && entry.images.length > 0 ? '현장 사진 있음' : '현장 사진 없음'}
                        </h3>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
                          const confirmed = confirm('이 보고서를 삭제하시겠습니까?');
                          if (confirmed) {
                            const filtered = savedEntries.filter(e => e.id !== entry.id);
                            setSavedEntries(filtered);
                            localStorage.setItem('safetyReports', JSON.stringify(filtered));
                          }
                        }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="text-sm text-gray-600 line-clamp-3">
                      {entry.diary.split('\n').slice(0, 3).join('\n')}...
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 보고서 상세 모달 */}
      {modal.isOpen && modal.report && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2 border-b">
              <h2 className="text-2xl font-bold">안전점검 보고서</h2>
              <div className="flex gap-2">
                {!editMode ? (
                  <>
                    <button
                    onClick={handleEdit}
                    className="bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 text-sm"
                  >
                    수정하기
                  </button>
                  <button
                    onClick={() => generatePDF(modal.report!)}
                    className="bg-green-500 text-white px-3 py-1.5 rounded hover:bg-green-600 text-sm"
                  >
                    PDF 저장
                  </button>
                </>
                ) : (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className="bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 text-sm"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => {
                        setEditMode(false);
                        setEditedDiary(modal.report?.diary || '');
                      }}
                      className="bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600 text-sm"
                    >
                      취소
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setModal({ isOpen: false, report: null });
                    setEditMode(false);
                  }}
                  className="bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600 text-sm"
                >
                  닫기
                </button>
              </div>
            </div>

            {/* 날짜 정보 */}
            <div className="mb-4 text-sm text-gray-600">
              작성일: {new Date(modal.report.date).toLocaleDateString()}
            </div>

            {/* 이미지 그리드 */}
            {modal.report.images && modal.report.images.length > 0 && (
              <div className="mb-4 p-2 bg-gray-50 rounded">
                <h3 className="text-sm font-semibold mb-2">현장 사진 ({modal.report.images.length}장)</h3>
                <div className="grid grid-cols-4 gap-1">
                  {modal.report.images.map((image, index) => (
                    <div 
                      key={index} 
                      className="relative aspect-square cursor-pointer"
                      onClick={() => window.open(image, '_blank')}
                    >
                      <img
                        src={image}
                        alt={`현장 사진 ${index + 1}`}
                        className="w-full h-full object-cover rounded border border-gray-200 hover:opacity-90"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 보고서 내용 */}
            <div className="prose max-w-none mt-4">
              {editMode ? (
                <textarea
                  value={editedDiary}
                  onChange={(e) => setEditedDiary(e.target.value)}
                  className="w-full h-96 p-4 border rounded resize-none"
                />
              ) : (
                <div className="whitespace-pre-wrap">{modal.report.diary}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 로딩 오버레이 */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent" />
            <p className="mt-4">{loadingMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
