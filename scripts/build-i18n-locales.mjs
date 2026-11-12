import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tools } from '../src/tools/registry.ts';
import { TOOL_BEGINNER_GUIDES } from '../src/tools/beginner-guides.tsx';
import { toolNotes } from '../src/seo.ts';

const root = resolve('.');
mkdirSync(join(root, 'src/i18n/locales'), { recursive: true });

// Complete English mapping dictionary for all 73 tools
const EN_TOOLS_META = {
  developer: {
    name: 'Developer & Text Utilities',
    task: 'Format code, generate cryptographically secure passwords, hashes (MD5, SHA, HMAC, JWT), Base64, UUID, and calculate file fingerprints in-browser.',
    group: 'Developer Utilities',
    guide: {
      intro: 'A privacy-first developer swiss-knife running completely inside your browser with zero data transmission.',
      steps: [
        'Select the utility tab (JSON format, Hash/HMAC, Password generator, Base64, UUID).',
        'Enter or paste text into the source input box.',
        'View the generated result instantly and click Copy or Download.'
      ],
      saveTip: 'All calculations are computed in local memory. Clear sensitive passwords after use.'
    },
    note: 'Code formatting and cryptographic operations run locally; passwords and secret keys are never uploaded.'
  },
  timestamp: {
    name: 'Unix Timestamp Converter',
    task: 'Convert between Unix timestamps (seconds and milliseconds) and human-readable dates with local and UTC support.',
    group: 'Developer Utilities',
    guide: {
      intro: 'Convert timestamps to date strings or pick a date to obtain its 10-digit or 13-digit Unix timestamp.',
      steps: [
        'Paste a timestamp into the input or use the current time button.',
        'Choose second (10-digit) or millisecond (13-digit) mode.',
        'Copy the formatted ISO, UTC, or local date string.'
      ],
      saveTip: 'Conversions are performed client-side based on your local device clock and timezone.'
    },
    note: 'Supports automatic 10-digit and 13-digit detection, timezone adjustment, and batch conversion.'
  },
  text: {
    name: 'Text Toolkit & Formatter',
    task: 'Count characters and words, clean duplicate lines, remove blank lines, sort lines, and convert punctuation for essays and articles.',
    group: 'Text Tools',
    guide: {
      intro: 'Fast text manipulation tool: count words, deduplicate lines, sort entries, and clean up formatting.',
      steps: [
        'Paste your text into the left editor.',
        'Click operation buttons (Deduplicate, Remove blank lines, Sort, Convert punctuation).',
        'Inspect real-time statistics (character, word, and line count) and copy cleaned text.'
      ],
      saveTip: 'Text is manipulated purely in browser memory with zero network requests.'
    },
    note: 'Word count adheres to standard Unicode character counting. Supports regex cleanup.'
  },
  finance: {
    name: 'Mortgage & Loan Calculator',
    task: 'Calculate monthly payments and total interest for equal principal & interest vs. equal principal loans with amortization schedules.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate loan repayment schedules, interest differences, and early payoff savings.',
      steps: [
        'Enter total loan principal, term in years, and annual interest rate.',
        'Compare Equal Principal & Interest (等额本息) vs Equal Principal (等额本金).',
        'View the month-by-month repayment breakdown and copy the schedule summary.'
      ],
      saveTip: 'Estimates are for financial planning and comparison only.'
    },
    note: 'Provides amortization schedules and interest comparison without uploading financial details.'
  },
  health: {
    name: 'BMI & Body Fat Calculator',
    task: 'Calculate body mass index (BMI), body fat percentage, BMR, and recommended daily calorie targets.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate BMI, body composition estimates, and daily calorie expenditure targets.',
      steps: [
        'Enter gender, age, height, and body weight.',
        'Review your BMI classification (Underweight, Normal, Overweight, Obese).',
        'Check estimated BMR and TDEE calorie benchmarks for fitness goals.'
      ],
      saveTip: 'Results are reference estimates and should not replace clinical medical advice.'
    },
    note: 'Calculations follow WHO and China CDC health guidelines.'
  },
  'color-picker': {
    name: 'Image Color Picker & Palette',
    task: 'Sample colors directly from uploaded images, get HEX/RGB/HSL codes, and generate harmonious palettes.',
    group: 'Images & Exams',
    guide: {
      intro: 'Extract precise colors from posters and photos to use in presentation design.',
      steps: [
        'Upload an image from your device.',
        'Click on any pixel with the loupe magnifier to sample its color.',
        'Copy HEX, RGB, or HSL color values and browse extracted dominant palettes.'
      ],
      saveTip: 'All image rendering and sampling happen on a local HTML5 canvas.'
    },
    note: 'Includes color harmony suggestions and WCAG contrast ratio checks.'
  },
  stitch: {
    name: 'Long Image Stitcher',
    task: 'Stitch multiple screenshots or document photos into a high-res continuous vertical or horizontal long image.',
    group: 'Images & Exams',
    guide: {
      intro: 'Combine multiple photos or screenshots seamlessly into one long image.',
      steps: [
        'Upload 2 to 10 images to stitch.',
        'Drag items to arrange order, adjust margins and borders.',
        'Preview the stitched canvas and click Download PNG.'
      ],
      saveTip: 'Stitching operates in local memory without quality loss or platform watermarks.'
    },
    note: 'Supports margin adjustments, border rounding, and high-DPI output.'
  },
  'pdf-page-number': {
    name: 'PDF Page Numbering',
    task: 'Add clean, customizable page numbers to PDF documents at any position, with font size and margin controls.',
    group: 'Document Tools',
    guide: {
      intro: 'Add neat page numbers to papers, reports, or thesis drafts before printing.',
      steps: [
        'Upload your PDF document.',
        'Select number position (bottom-center, bottom-right, etc.) and format.',
        'Specify start page and offset, then click Download PDF.'
      ],
      saveTip: 'PDF rendering and modification take place locally via WebAssembly.'
    },
    note: 'Supports skipping cover pages and custom prefix/suffix formatting.'
  },
  'pdf-crop': {
    name: 'PDF Margin Crop',
    task: 'Crop excess margins and white borders from PDFs to enlarge reading area for tablets and mobile devices.',
    group: 'Document Tools',
    guide: {
      intro: 'Trim blank margins from lecture slides and eBooks for better tablet readability.',
      steps: [
        'Upload your PDF file.',
        'Drag the visual crop box to set margins for all pages.',
        'Download the cropped PDF with enlarged content.'
      ],
      saveTip: 'Original vector quality is preserved without rasterization.'
    },
    note: 'Trims margins on all pages while preserving text vectors and links.'
  },
  'pdf-watermark': {
    name: 'PDF Watermark Tool',
    task: 'Add tiled or single anti-theft text watermarks across PDF pages to prevent unauthorized distribution.',
    group: 'Document Tools',
    guide: {
      intro: 'Stamp custom security watermarks across PDF pages to protect study materials.',
      steps: [
        'Upload your PDF document.',
        'Enter watermark text, adjust rotation angle, color, and opacity.',
        'Preview the overlay and download the watermarked PDF.'
      ],
      saveTip: 'Files are processed in local memory and never transmitted.'
    },
    note: 'Supports full-page diagonal tiling and custom font sizes.'
  },
  'image-watermark': {
    name: 'ID & Photo Watermark',
    task: 'Stamp security watermarks (e.g. "For Exam Verification Only") onto ID cards and certificate photos in-browser.',
    group: 'Images & Exams',
    guide: {
      intro: 'Add protective anti-fraud text across ID photos and certificates.',
      steps: [
        'Upload an ID photo, certificate, or document scan.',
        'Choose a preset text (e.g. "For Verification Only") or enter custom text.',
        'Adjust opacity and angle, then save the protected image.'
      ],
      saveTip: 'Safeguard your personal identity documents before submitting to external platforms.'
    },
    note: 'Prevents identity theft when submitting scanned documents online.'
  },
  timetable: {
    name: 'University Timetable Generator',
    task: 'Build your semester weekly course schedule, configure odd/even weeks, and export ICS calendar files with reminders.',
    group: 'Study & Writing',
    guide: {
      intro: 'Design a semester course timetable with odd/even week rules and export to mobile calendar.',
      steps: [
        'Add courses with name, classroom, teacher, periods, and week ranges.',
        'Configure semester start date and total weeks.',
        'Export ICS calendar file or save a timetable screenshot.'
      ],
      saveTip: 'Data is automatically saved in browser local storage. Export ICS to import into iOS/Android Calendar.'
    },
    note: 'Supports ICS calendar export, conflict detection, and odd/even week filtering.'
  },
  'leave-helper': {
    name: 'Student Leave Request Helper',
    task: 'Draft polite, context-appropriate leave request messages to college counselors and professors.',
    group: 'Study & Writing',
    guide: {
      intro: 'Draft polite leave request messages tailored for counselors, professors, and class committees.',
      steps: [
        'Select leave reason (sick leave, family emergency, interview, competition).',
        'Fill in dates, course names, and recipient titles.',
        'Copy the drafted polite message directly to WeChat or email.'
      ],
      saveTip: 'Templates follow formal campus communication etiquette.'
    },
    note: 'Offers casual, formal, and emergency tone presets with one-click copy.'
  },
  'material-collector': {
    name: 'Class Material Collector & Audit',
    task: 'Cross-reference submitted files against your class roster, detect missing submissions, and standardize filenames.',
    group: 'Images & Exams',
    guide: {
      intro: 'Help class monitors check who has submitted homework and export a missing checklist.',
      steps: [
        'Paste the class student name and ID roster.',
        'Drop all collected submission files into the dropzone.',
        'View the instant audit report showing who submitted and who is missing.'
      ],
      saveTip: 'File names are parsed locally; document contents are not read or uploaded.'
    },
    note: 'Auto-extracts student IDs and names from messy filenames.'
  },
  'file-organizer': {
    name: 'Batch File Organizer & Renamer',
    task: 'Batch rename, sort, and organize photos and documents using customizable numbering patterns into a zip package.',
    group: 'Document Tools',
    guide: {
      intro: 'Standardize disorderly homework or photo names with sequential numbering.',
      steps: [
        'Drop your collection of files into the tool.',
        'Set prefix, starting sequence number, and naming pattern.',
        'Preview new filenames and download all renamed files in a ZIP archive.'
      ],
      saveTip: 'All archiving and renaming occur inside browser memory.'
    },
    note: 'Customizable tokens include [index], [date], [original], and [ext].'
  },
  'batch-pdf': {
    name: 'Batch PDF Operations',
    task: 'Process multiple PDF files simultaneously: extract pages, convert to images, and download as organized archives.',
    group: 'Document Tools',
    guide: {
      intro: 'Batch extract pages or convert multi-document queues into PNGs.',
      steps: [
        'Upload multiple PDF files.',
        'Configure page ranges or conversion targets for each item.',
        'Execute batch processing and download results individually or as a ZIP.'
      ],
      saveTip: 'Processed one-by-one in browser memory to avoid browser memory spikes.'
    },
    note: 'Recommended up to 20MB per file and 50 pages maximum.'
  },
  materials: {
    name: 'Application Material Checker',
    task: 'Verify uploaded photos and attachments against official exam requirements for dimensions, format, and size.',
    group: 'Images & Exams',
    guide: {
      intro: 'Audit whether your registration attachments meet official guidelines.',
      steps: [
        'Configure required file type, resolution range, and KB size thresholds.',
        'Upload your candidate documents.',
        'Review the pass/fail checklist before final exam registration submission.'
      ],
      saveTip: 'Verify in advance to prevent registration rejections.'
    },
    note: 'Provides compliance checks according to common China national exam portals.'
  },
  ppt: {
    name: 'PPTX File Slimmer',
    task: 'Compress embedded presentation images to drastically reduce PPTX file size for submission.',
    group: 'Document Tools',
    guide: {
      intro: 'Reduce presentation file size when homework systems or emails reject oversized PPTs.',
      steps: [
        'Select your .pptx presentation file.',
        'Select image compression quality level (Recommended or High Compression).',
        'Download the slimmed .pptx file with identical layout and animations.'
      ],
      saveTip: 'Slides, shapes, formulas, and text remain fully editable vector objects.'
    },
    note: 'Compresses only embedded bitmap images while preserving vector slide structures.'
  },
  'ppt-extract': {
    name: 'PPT Media & Image Extractor',
    task: 'Extract all embedded high-res images and media from PowerPoint presentations and export as a ZIP archive.',
    group: 'Document Tools',
    guide: {
      intro: 'Extract original illustrations, charts, and photos from teacher slide decks.',
      steps: [
        'Upload a .pptx presentation.',
        'Preview all extracted pictures, graphics, and background media.',
        'Download selected images or package all media into a ZIP file.'
      ],
      saveTip: 'Extracts original uncompressed image streams embedded in the deck.'
    },
    note: 'Generates an image manifest with slide numbers and dimensions.'
  },
  scan: {
    name: 'Document Scan Enhancer',
    task: 'Enhance phone-captured document photos into crisp, high-contrast monochrome photocopies with shadow removal.',
    group: 'Images & Exams',
    guide: {
      intro: 'Convert camera snapshots of paper assignments into clean, high-contrast scanner documents.',
      steps: [
        'Upload a photo of your paper document or homework.',
        'Adjust contrast, brightness, rotation, and shadow suppression.',
        'Download the enhanced crisp document ready for printing or submission.'
      ],
      saveTip: 'Client-side image processing ensures study notes remain confidential.'
    },
    note: 'Simulates office photocopier filters with adaptive thresholding.'
  },
  privacy: {
    name: 'PDF Metadata Sanitizer',
    task: 'Strip author names, software signatures, creation dates, and hidden metadata from PDFs prior to blind submission.',
    group: 'Document Tools',
    guide: {
      intro: 'Clean personal information from PDF properties before double-blind thesis review.',
      steps: [
        'Upload your PDF research paper or report.',
        'Inspect existing author, creator, producer, and title metadata.',
        'Click Sanitize to wipe all metadata and download a sanitized document.'
      ],
      saveTip: 'Note: metadata stripping removes file headers; manually verify body text for names.'
    },
    note: 'Wipes DocInfo and XMP metadata streams completely.'
  },
  wishes: {
    name: 'Feature Wishlist & Anti-Paywall',
    task: 'Tell us about student software paywalls or request new free, privacy-first tools to build.',
    group: 'Wishlist',
    guide: {
      intro: 'Tell the author what tools you need or where you got hit by unreasonable paywalls.',
      steps: [
        'Describe the tool or feature you wish existed.',
        'Mention the commercial software charging for this basic feature.',
        'Copy your feedback or send it directly to the developer.'
      ],
      saveTip: 'All feedback is open, community-driven, and reviewed for future roadmap releases.'
    },
    note: 'Community feedback directly shapes each monthly NOVIP tool release.'
  },
  handwrite: {
    name: 'Realistic Handwriting Generator',
    task: 'Simulate multi-page realistic Chinese handwriting on notebook paper, exporting high-res PNG or PDF.',
    group: 'Study & Writing',
    guide: {
      intro: 'Simulate natural handwritten notes on lined paper for study logs and assignments.',
      steps: [
        'Paste your text into the editor.',
        'Choose handwriting font, paper texture (ruled, grid, blank), ink color, and jitter.',
        'Preview multi-page layout and export high-resolution PNG or PDF.'
      ],
      saveTip: 'Text and fonts are processed locally; supports up to 20,000 characters per document.'
    },
    note: 'Includes random glyph perturbations and margin variations for natural realism.'
  },
  'pdf-merge-split': {
    name: 'PDF Merge & Split',
    task: 'Merge multiple PDFs in custom order, or split documents by page ranges or into individual pages with zero upload.',
    group: 'Document Tools',
    guide: {
      intro: 'Combine multiple lecture slides or split oversized PDFs right in your browser.',
      steps: [
        'Upload PDF files to merge, or pick one PDF to split.',
        'Drag items to rearrange merge order, or specify split page ranges (e.g. 1-3, 5).',
        'Download the merged PDF or a ZIP archive containing the split sections.'
      ],
      saveTip: 'Handles files up to 100MB with client-side WebAssembly streaming.'
    },
    note: 'Zero server upload; page deletion and page extraction supported.'
  },
  'pdf-compress': {
    name: 'PDF Compressor & Resampler',
    task: 'Resample and compress PDF documents locally with light, recommended, or extreme presets to meet upload limits.',
    group: 'Document Tools',
    guide: {
      intro: 'Reduce PDF file size to pass school portal upload thresholds.',
      steps: [
        'Select an oversized PDF file.',
        'Choose compression level: Light, Recommended, Extreme, or Structural.',
        'Compare original vs. compressed size and download the reduced file.'
      ],
      saveTip: 'Safety lock: if compressed size exceeds original, the original is automatically retained.'
    },
    note: 'Intelligently recompresses embedded images without corrupting text streams.'
  },
  'photo-check': {
    name: 'ID Photo Compliance Doctor',
    task: 'Check ID photo pixel dimensions, KB file size, background color, and ratio with one-click 480×640 compliance repair.',
    group: 'Images & Exams',
    guide: {
      intro: 'Test if your exam registration photo meets official criteria before submitting.',
      steps: [
        'Upload your candidate photo.',
        'Inspect diagnostic report: width/height, file size, background uniformity, aspect ratio.',
        'Click One-Click Repair to auto-scale to standard 480×640 resolution.'
      ],
      saveTip: 'Face detection and geometry analysis run locally without face data transmission.'
    },
    note: 'Covers CET-4/6, Graduate Exam, Teacher Certification, and Civil Service photo criteria.'
  },
  files: {
    name: 'File Format Converter',
    task: 'Convert between PDF, Word, PowerPoint, and images in-browser without waiting queues or watermarks.',
    group: 'Document Tools',
    guide: {
      intro: 'Universal document format converter: Office, PDF, and image transformations.',
      steps: [
        'Choose conversion pair (e.g. Word to PDF, PDF to Images, PPT to PDF).',
        'Upload your source document.',
        'Download the converted output file with zero queueing.'
      ],
      saveTip: 'Basic conversions occur in browser; complex layouts may undergo minor reflow.'
    },
    note: 'Includes format options for DOCX, PPTX, PDF, PNG, and JPEG.'
  },
  photo: {
    name: 'ID Photo Specification Assistant',
    task: 'Crop and adjust photos for college exams (CET-4/6, graduate exam, teacher license) to 480×640 and under 100KB.',
    group: 'Images & Exams',
    guide: {
      intro: 'Standardize everyday portraits into official student exam photos.',
      steps: [
        'Upload a portrait photo.',
        'Select exam template (1-inch, 2-inch, CET-4/6 480×640) and align the face guide.',
        'Crop, compress under 100KB, and download the finished photo.'
      ],
      saveTip: 'Preview photo compliance in real time before exam website submission.'
    },
    note: 'Preset dimensions for major Chinese national examinations.'
  },
  images: {
    name: 'Batch Image Converter & Resizer',
    task: 'Batch compress, resize, and convert images between PNG, JPEG, and WebP, exporting as a ZIP.',
    group: 'Images & Exams',
    guide: {
      intro: 'Resize, format-shift, and compress queues of images in one pass.',
      steps: [
        'Select multiple images.',
        'Set target format (JPG, PNG, WebP), max dimensions, and compression quality.',
        'Download all converted pictures in a single ZIP package.'
      ],
      saveTip: 'Browser canvas parallel encoding delivers rapid batch processing.'
    },
    note: 'Supports bulk aspect ratio locking and sequential renaming.'
  },
  background: {
    name: 'ID Photo Background Color Replacer',
    task: 'Replace photo background with standard blue, white, or red for student exams and IDs.',
    group: 'Images & Exams',
    guide: {
      intro: 'Change portrait photo backgrounds to official white, blue, or red.',
      steps: [
        'Upload your ID photo.',
        'Use brush and eraser tools to refine background masks around hair and shoulders.',
        'Select new background color and download the composite image.'
      ],
      saveTip: 'Semi-automated interactive matting keeps facial biometric data on device.'
    },
    note: 'Offers standard RGB hexadecimal color values for official Chinese credentials.'
  },
  ocr: {
    name: 'Client-Side Image OCR',
    task: 'Extract Chinese and English text from images and scanned PDF pages locally in browser without sending data.',
    group: 'Study & Writing',
    guide: {
      intro: 'Extract editable text from screenshots, blackboard photos, and scanned PDFs.',
      steps: [
        'Upload image or scanned PDF document (up to 5 pages).',
        'Select recognition language (Simplified Chinese + English or English only).',
        'Review extracted text, edit typos, and copy or download TXT.'
      ],
      saveTip: 'Initial OCR engine loading takes a few seconds; subsequent runs are cached.'
    },
    note: 'Powered by in-browser Tesseract.js engine; check sensitive numbers manually.'
  },
  references: {
    name: 'GB/T 7714 Citation Formatter',
    task: 'Format bibliography entries according to China national standard GB/T 7714-2015 / 2025 with rule validation.',
    group: 'Study & Writing',
    guide: {
      intro: 'Standardize academic bibliography citations according to China National Standard GB/T 7714.',
      steps: [
        'Paste raw reference items or fill in title, authors, journal, year, and pages.',
        'Select citation standard (GB/T 7714-2025 or 2015) and entry kind (Journal, Book, Thesis, Conf).',
        'Review automated validation diagnostics and copy formatted citation text.'
      ],
      saveTip: 'Validates author formatting (Family|Given), abbreviations, and DOI punctuation.'
    },
    note: 'Supports GB/T 7714-2025 and 2015 rules across all standard reference types.'
  },
  'docx-check': {
    name: 'DOCX Thesis Layout Inspector',
    task: 'Inspect heading hierarchy, font sizes, line spacing, margins, and indentations against graduation thesis standards.',
    group: 'Study & Writing',
    guide: {
      intro: 'Check academic thesis Word documents for formatting discrepancies prior to submission.',
      steps: [
        'Upload your .docx document draft.',
        'Inspect automated audit: heading hierarchy, paragraph indentation, and font consistency.',
        'Review flagged formatting errors with recommendations for Word fixes.'
      ],
      saveTip: 'Inspects document XML directly in memory without modifying source files.'
    },
    note: 'Checks common graduation thesis layout rules (heading sizes, line spacing, margins).'
  },
  compare: {
    name: 'Document Text Diff & Comparator',
    task: 'Compare two revisions of text or documents side-by-side to highlight additions, deletions, and modifications.',
    group: 'Study & Writing',
    guide: {
      intro: 'Highlight textual revisions and differences between two paper drafts.',
      steps: [
        'Paste original text on the left and revised text on the right.',
        'Review synchronized diff highlighting added, removed, and changed passages.',
        'Copy summary diff report or view side-by-side comparison.'
      ],
      saveTip: 'Computes character-level and word-level Myers diff algorithm in browser.'
    },
    note: 'Side-by-side and unified diff views with character-level accuracy.'
  },
  resume: {
    name: 'Student Resume Builder',
    task: 'Build professional, clean student resumes with multiple themes and export crisp, watermark-free PDFs.',
    group: 'Study & Writing',
    guide: {
      intro: 'Create concise, elegant one-page campus recruitment and internship resumes.',
      steps: [
        'Fill in education, campus activities, project experience, and skills.',
        'Choose visual typography theme (Classic Navy, Modern Emerald, Minimal Slate).',
        'Download vector PDF resume without platform watermarks or fees.'
      ],
      saveTip: 'Information is saved in browser storage; export JSON backup before clearing cache.'
    },
    note: 'Adheres to one-page executive resume layout standards.'
  },
  ai: {
    name: 'NOVIP AI Academic Guide',
    task: 'Connect to free AI models (Google Gemini Flash) and client-side rules to answer academic questions and suggest tools.',
    group: 'Study & Writing',
    guide: {
      intro: 'An intelligent academic guide answering study inquiries and directing to matching campus tools.',
      steps: [
        'Type your academic question, document issue, or formula problem.',
        'Receive step-by-step guidance, formulas, draft replies, or tool shortcuts.',
        'Optionally configure your free Google Gemini API key for advanced reasoning.'
      ],
      saveTip: 'Includes offline rule-based academic engine for instant local responses.'
    },
    note: 'Connects to Google Gemini Flash API with fallback to local rule heuristics.'
  },
  course: {
    name: 'Course Project & Defense Outline',
    task: 'Plan course project structures, organize milestone timelines, and generate presentation defense outlines.',
    group: 'Study & Writing',
    guide: {
      intro: 'Structure semester project milestones, defense slide outlines, and team tasks.',
      steps: [
        'Enter project topic, course name, and deliverable deadline.',
        'Select project methodology template (Software Engineering, Lab Experiment, Literature Survey).',
        'Copy generated slide deck structure and milestone checklist.'
      ],
      saveTip: 'Jumpstarts oral presentations and end-of-term deliverables.'
    },
    note: 'Includes standard defense slide decks with timing guides.'
  },
  sheets: {
    name: 'Excel & Table Merge',
    task: 'Merge multiple student rosters, registration forms, or score sheets into a consolidated spreadsheet.',
    group: 'Data Processing',
    guide: {
      intro: 'Merge multiple class survey sheets or assignment rosters into one master Excel file.',
      steps: [
        'Upload multiple .xlsx or .csv files.',
        'Align common column headers (e.g. Student ID, Name, Phone).',
        'Download the merged workbook with preserved data rows.'
      ],
      saveTip: 'Spreadsheets are parsed locally; sensitive student rosters stay on your machine.'
    },
    note: 'Preserves student IDs without scientific notation corruption.'
  },
  'table-clean': {
    name: 'Table & CSV Data Cleaner',
    task: 'Clean messy CSV/Excel tables: deduplicate rows, trim whitespace, normalize formats, and split combined fields.',
    group: 'Data Processing',
    guide: {
      intro: 'Clean up dirty spreadsheet data: remove duplicate rows, normalize dates, and trim whitespace.',
      steps: [
        'Upload a .csv or .xlsx dataset.',
        'Select data cleaning filters: deduplicate rows, strip invisible spaces, replace null values.',
        'Export sanitized table as CSV or Excel.'
      ],
      saveTip: 'Cleans large datasets in seconds using local web workers.'
    },
    note: 'Handles encoding anomalies (UTF-8, GBK) and phone number formatting.'
  },
  lab: {
    name: 'Lab Data Calculator & Linear Fitting',
    task: 'Calculate averages, standard deviations, and linear regression fits (y = mx + b) for STEM laboratory reports.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate mean, standard deviation, and least-squares regression lines for lab coursework.',
      steps: [
        'Enter X and Y experimental coordinate pairs.',
        'Inspect calculated slope (m), intercept (b), R² correlation, and standard deviations.',
        'Copy data table summary and formula breakdown for your lab report.'
      ],
      saveTip: 'Provides step-by-step intermediate formula results for easy verification.'
    },
    note: 'Performs least-squares regression and uncertainty analysis in-browser.'
  },
  grades: {
    name: 'Final Exam Target Score & GPA Calculator',
    task: 'Reverse-calculate required final exam scores to reach target grades, and compute weighted GPA across multiple scales.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate GPA across multiple scales and reverse-calculate needed final exam points.',
      steps: [
        'Tab 1: Enter regular score, weight, and target final grade to calculate needed exam score.',
        'Tab 2: Add courses, credits, and grades to calculate weighted GPA and ranking score.',
        'Select grading scale (Standard 4.0, Peking Univ 4.0, 5.0 Scale) and copy the report.'
      ],
      saveTip: 'Course data is stored in your browser; export or copy your transcript summary.'
    },
    note: 'Supports standard 4.0, 4.3, 4.5, and 5.0 GPA algorithms used across universities.'
  },
  cost: {
    name: 'VIP Paywall Cost & Free Alternatives',
    task: 'Examine single-use costs of commercial tools and discover 100% free, privacy-first open-source alternatives.',
    group: 'Calculations',
    guide: {
      intro: 'See how much commercial office software charges students and find free alternatives.',
      steps: [
        'Browse common fee traps (PDF editing, document conversion, handwriting apps).',
        'Compare commercial VIP pricing with NOVIP client-side equivalents.',
        'Bookmark free tools to save student allowances.'
      ],
      saveTip: 'All tools on NOVIP remain permanently free, open, and watermark-free.'
    },
    note: 'Compares real market pricing and explains open-source web tech equivalents.'
  },
  'college-nav': {
    name: 'College Official Portals Directory',
    task: 'Verified direct links to essential student portals: CHSI (学信网), Graduate Admissions (研招网), CET, and certification sites.',
    group: 'Calculations',
    guide: {
      intro: 'Direct, ad-free directory of verified official Chinese college examination and service portals.',
      steps: [
        'Select category (Enrollment & Admissions, Exams & Credentials, Scholarships, Overseas).',
        'Search portal name or keyword (e.g. CHSI, CET, NEEA).',
        'Click to open the verified official website directly.'
      ],
      saveTip: 'All URLs are verified against official .edu.cn and .gov.cn domains.'
    },
    note: 'Filters phishing sites and commercial affiliate ads.'
  },
  'ppt-generate': {
    name: 'Presentation Outline Generator',
    task: 'Generate structured slide decks and outlines for thesis proposals, defense presentations, and project roadmaps.',
    group: 'Study & Writing',
    guide: {
      intro: 'Generate standard PPTX presentation outlines and slide hierarchies for college defense.',
      steps: [
        'Enter presentation title, speaker name, and presentation genre.',
        'Customize slide count, section titles, and talking points.',
        'Download the generated editable .pptx slide deck.'
      ],
      saveTip: 'Generated presentation contains standard layout slides ready for customization.'
    },
    note: 'Built on pptxgenjs; exports editable native PowerPoint presentations.'
  },
  'pdf-form': {
    name: 'PDF Form Fill & Sign',
    task: 'Fill out scholarship, exam, or club application PDF forms and stamp handwritten signatures without printing.',
    group: 'Document Tools',
    guide: {
      intro: 'Fill in application forms and add digital handwritten signatures to PDFs without printing.',
      steps: [
        'Upload your PDF application form.',
        'Add text fields, checkboxes, and draw your signature on the canvas.',
        'Download the completed, signed PDF document.'
      ],
      saveTip: 'Signatures and form entries remain completely private in local memory.'
    },
    note: 'Supports text fields, checkmarks, date stamps, and signature insertion.'
  },
  'image-compress': {
    name: 'Precise Image KB Compressor',
    task: 'Binary-search compression engine to squeeze oversized photos down below 100KB or 50KB with visual quality preview.',
    group: 'Images & Exams',
    guide: {
      intro: 'Compress images to strict KB thresholds (e.g. under 100KB for exam websites).',
      steps: [
        'Upload an image exceeding file size limits.',
        'Set target maximum file size (e.g. 100KB, 50KB) or use quality sliders.',
        'Review compressed file size and visual preview, then download.'
      ],
      saveTip: 'Binary search optimization finds the optimal quality factor in milliseconds.'
    },
    note: 'Features precise binary-search compression to hit exact target KB limits.'
  },
  flowchart: {
    name: 'Mermaid Diagram Studio',
    task: 'Create flowcharts, sequence diagrams, state machines, and class diagrams using clean Mermaid syntax.',
    group: 'Study & Writing',
    guide: {
      intro: 'Render flowcharts, sequence diagrams, and architecture diagrams with Mermaid code.',
      steps: [
        'Type or select Mermaid syntax templates (Flowchart, Sequence, ER, Gantt).',
        'Watch the diagram render in real time on the right canvas.',
        'Export crisp vector SVG or high-resolution PNG.'
      ],
      saveTip: 'Rendered client-side via Mermaid.js; ideal for engineering theses and homework.'
    },
    note: 'Supports SVG vector and PNG raster exports with zoom and pan controls.'
  },
  'media-converter': {
    name: 'Media Audio & GIF Converter',
    task: 'Extract MP3 audio from lecture videos and record animated GIFs from video clips directly in your browser.',
    group: 'Document Tools',
    guide: {
      intro: 'Extract audio from video lectures and create animated GIFs in-browser.',
      steps: [
        'Upload a video or audio file.',
        'Select conversion target: Extract MP3, convert to WAV, or generate animated GIF.',
        'Trim start/end times and download the converted media.'
      ],
      saveTip: 'Processed via WebCodecs and canvas without uploading heavy media files.'
    },
    note: 'Extracts MP3 tracks and trims video segments into animated GIFs.'
  },
  'web-to-apk': {
    name: 'Web App to Android APK Packager',
    task: 'Package mobile websites or PWAs into signed, standalone Android APK installation packages.',
    group: 'Developer Utilities',
    guide: {
      intro: 'Transform web apps, portfolios, or games into installable Android APK packages.',
      steps: [
        'Enter website URL, App name, package ID, and upload an App icon.',
        'Configure display orientation and navigation bar styling.',
        'Download the signed Android APK package and install on Android devices.'
      ],
      saveTip: 'APK packaging and digital signing occur 100% inside browser memory.'
    },
    note: 'Generates valid v1/v2 signed APK packages installable on Android 5.0+.'
  },
  qr: {
    name: 'QR Code Generator & Scanner',
    task: 'Generate customizable QR codes with embedded logos and decode QR codes from screen or uploaded images.',
    group: 'Developer Utilities',
    guide: {
      intro: 'Generate branded QR codes for club activities and scan QR codes from screenshots.',
      steps: [
        'Tab 1: Enter link or text, customize colors, error correction, and add center logo.',
        'Tab 2: Drop image to decode QR code contents instantly.',
        'Download crisp PNG or SVG QR code.'
      ],
      saveTip: 'Generates vector and raster QR codes locally with high error correction levels.'
    },
    note: 'Supports logo embedding, color gradients, and offline image decoding.'
  },
  'random-pick': {
    name: 'Fair Random Picker & Lucky Draw',
    task: 'Draw fair random winners, assign presentation sequences, or divide study groups with cryptographic randomness.',
    group: 'Calculations',
    guide: {
      intro: 'Fair random draw generator for classroom roll call, prize draws, and team splitting.',
      steps: [
        'Enter names or items (one per line).',
        'Choose mode: Lucky draw, random order shuffle, or group assignment.',
        'Click Draw to reveal results with cryptographic randomness.'
      ],
      saveTip: 'Powered by crypto.getRandomValues() for uncompromised fairness.'
    },
    note: 'Uses cryptographic pseudo-random number generator (CSPRNG) for absolute fairness.'
  },
  'id-card-layout': {
    name: 'A4 ID Card Print Layout',
    task: 'Automatically arrange front and back of ID cards at true 1:1 physical millimeter scale onto an A4 PDF sheet.',
    group: 'Images & Exams',
    guide: {
      intro: 'Format ID card front and back onto an A4 page at true 1:1 physical scale for printing.',
      steps: [
        'Upload front and back photos of your Chinese ID card or student badge.',
        'Adjust orientation, filter out background shadows, and add watermark protection.',
        'Export print-ready A4 PDF or high-resolution PNG image.'
      ],
      saveTip: 'Ensures printed ID card matches true 85.6mm × 54.0mm physical dimensions.'
    },
    note: 'Calibrated to ISO/IEC 7810 ID-1 standard dimensions (85.6mm × 54.0mm).'
  },
  'split-bill': {
    name: 'Roommate & Dinner Bill Splitter',
    task: 'Split dormitory utilities and restaurant group bills fairly, calculate minimum transfers, and copy payment summaries.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate fair cost splits for dormitory utilities, travel, and group meals.',
      steps: [
        'Add participants and log expenses paid by individuals.',
        'Review automated settlement calculating minimum number of bank transfers.',
        'Copy summary text to WeChat group.'
      ],
      saveTip: 'Simplifies complex multi-person payments into minimal settlement transfers.'
    },
    note: 'Minimizes peer-to-peer transactions using graph debt simplification.'
  },
  'class-fund': {
    name: 'Class Fund Ledger & Notice',
    task: 'Track class activity expenditures and dues, generate public transparent accounting notices, and export CSV.',
    group: 'Calculations',
    guide: {
      intro: 'Help class committee track activity expenses and publish financial transparency notices.',
      steps: [
        'Enter income and expense records with category, amount, and date.',
        'Inspect balance overview, category spending charts, and remaining funds.',
        'Copy the structured announcement to class chat or export CSV ledger.'
      ],
      saveTip: 'All ledger data remains on device; export CSV to back up records.'
    },
    note: 'Categorizes expenditures and outputs formatted public notices.'
  },
  'exam-plan': {
    name: 'Exam Countdown & Study Planner',
    task: 'Track remaining days for multiple finals and tests, generate backward study milestones, and export revision schedules.',
    group: 'Study & Writing',
    guide: {
      intro: 'Organize exam dates, count down remaining days, and schedule study milestones.',
      steps: [
        'Add upcoming exams with course names and test dates.',
        'Select an exam to generate structured weekly review phases and mock test milestones.',
        'Copy revision plan text or export schedule CSV.'
      ],
      saveTip: 'Sorted chronologically to help prioritize urgent finals.'
    },
    note: 'Generates backward planning schedules with daily study rhythm recommendations.'
  },
  'composite-score': {
    name: 'Comprehensive Evaluation Score',
    task: 'Calculate student merit evaluation scores across moral, academic, and physical fitness criteria with weighted rankings.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate student annual merit scores and scholarship eligibility.',
      steps: [
        'Enter scores for moral conduct, academic performance, and physical extracurriculars.',
        'Adjust weight percentages (default 20% moral, 70% academic, 10% fitness).',
        'Paste class roster data to compute rankings and class averages.'
      ],
      saveTip: 'Automates scholarship evaluation calculations for students and class leaders.'
    },
    note: 'Supports weighted GPA sub-calculations and batch class roster rankings.'
  },
  'fitness-test': {
    name: 'Student Fitness Test Benchmark',
    task: 'Score university national fitness test performances (runs, pull-ups, sit-ups) against official standards.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate national student physical fitness test scores and identify weak events.',
      steps: [
        'Select gender, grade level, and enter scores across 7 standard test events.',
        'View weighted standard scores, bonus points, overall grade (Pass, Good, Excellent).',
        'Review point gap needed to advance to the next performance tier.'
      ],
      saveTip: 'Scoring aligns with Ministry of Education National Student Physical Fitness Standards.'
    },
    note: 'Implements official China college fitness test scoring matrices and bonus tables.'
  },
  'internship-tax': {
    name: 'Student Internship Tax Calculator',
    task: 'Compare student internship withholding methods against standard tax withholding and estimate annual tax refunds.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate individual income tax withholding on student internship stipends and estimate annual refunds.',
      steps: [
        'Enter monthly pre-tax internship remuneration.',
        'Compare Student Cumulative Withholding Method vs. General Labor Remuneration Method.',
        'Estimate potential tax refund at the annual comprehensive tax reconciliation.'
      ],
      saveTip: 'Helps interns understand tax deduction rights and annual tax settlement.'
    },
    note: 'Calculates tax withholding under State Taxation Administration Announcement No. 13 (2020).'
  },
  'student-loan': {
    name: 'Student Loan Repayment Planner',
    task: 'Calculate year-by-year student loan principal, interest grace periods, and amortization schedules based on CDB standards.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate annual repayment amounts and interest schedules for China Development Bank student loans.',
      steps: [
        'Enter loan principal, enrollment year, duration of study, total loan term, and interest rate.',
        'Review repayment schedule: 5-year grace period (interest only), followed by equal principal installments.',
        'Copy summary or export detailed CSV payment schedule.'
      ],
      saveTip: 'Reflects interest calculation rules ending on September 20 of each year.'
    },
    note: 'Follows China Development Bank hometown student loan interest rules.'
  },
  'thesis-check': {
    name: 'Thesis Content Self-Check Assistant',
    task: 'Audit graduation thesis draft structure, section numbering, figure citations, and repetitive text locally.',
    group: 'Study & Writing',
    guide: {
      intro: 'Check academic thesis drafts for missing structural sections and numbering anomalies.',
      steps: [
        'Paste full thesis text or upload .txt / .md / .docx document.',
        'Audit structural completeness (Abstract, Intro, Method, Result, Conclusion, References).',
        'Verify heading numbering sequence, figure/table citation matches, and internal duplicates.'
      ],
      saveTip: 'Audited entirely in local memory; thesis text is never transmitted or retained.'
    },
    note: 'Verifies heading continuity, figure callouts, and abstract word count limits.'
  },
  'docx-format': {
    name: 'One-Click DOCX Formatter',
    task: 'Apply standardized heading tiers, font families, line spacing, indentations, and margins to unformatted Word docs.',
    group: 'Study & Writing',
    guide: {
      intro: 'Standardize unformatted Word documents into clean, academic typography in one click.',
      steps: [
        'Upload your .docx document draft.',
        'Choose a formatting preset (Graduation Thesis, Course Report, Formal Document).',
        'Download the standardized .docx file with normalized styles, line spacing, and margins.'
      ],
      saveTip: 'Original document text, images, and tables are preserved; only styles are adjusted.'
    },
    note: 'Standardizes headings, body fonts (SimSun/Times New Roman), line spacing (1.5x), and indentations.'
  },
  'group-free-time': {
    name: 'Group Common Free Time Finder',
    task: 'Paste multiple student class schedules to instantly detect shared free periods and optimal meeting hours.',
    group: 'Study & Writing',
    guide: {
      intro: 'Find mutually free study and meeting times among group project teammates.',
      steps: [
        'Paste or import schedules from multiple teammates.',
        'View the consolidated weekly heatmap highlighting shared free time slots.',
        'Copy optimal meeting windows or export an ICS calendar event.'
      ],
      saveTip: 'Calculated completely offline; great for club meetings and group assignments.'
    },
    note: 'Heatmap visualization highlights optimal meeting windows across group members.'
  },
  focus: {
    name: 'Immersive Pomodoro & White Noise',
    task: 'Focus timer with 4 synthesized background white noise channels (rain, library, fan, waves) for productive study.',
    group: 'Study & Writing',
    guide: {
      intro: 'Distraction-free study timer with real-time synthesized ambient sounds.',
      steps: [
        'Select focus duration (e.g. 25 min Pomodoro) and break intervals.',
        'Choose ambient noise channel (Summer Rain, Campus Library, Fan, Ocean Waves).',
        'Start the timer and immerse in productive study.'
      ],
      saveTip: 'Audio is synthesized locally via Web Audio API with zero audio file downloads.'
    },
    note: 'Web Audio API noise generators run completely offline without downloading audio assets.'
  },
  'postgrad-score': {
    name: 'Graduate Exam Weighted Score',
    task: 'Calculate weighted initial and interview exam scores (5:5, 6:4, 7:3) and determine required interview scores to pass.',
    group: 'Calculations',
    guide: {
      intro: 'Calculate graduate entrance exam composite score and reverse-calculate needed interview marks.',
      steps: [
        'Enter preliminary exam total score (out of 500) and preliminary/interview weighting ratio.',
        'Enter current or target interview score (out of 100).',
        'Review overall composite score and minimum interview score needed to achieve admission target.'
      ],
      saveTip: 'Supports custom weight formulas used by various graduate schools.'
    },
    note: 'Supports 50:50, 60:40, and 70:30 weighting formulas for Chinese graduate admissions.'
  },
  'dorm-power': {
    name: 'Dorm Electricity Bill Split',
    task: 'Apportion room electricity expenses weighted by days present, offset prepayments, and create clear WeChat summaries.',
    group: 'Calculations',
    guide: {
      intro: 'Fairly divide room electricity and utility bills weighted by actual days in dormitory.',
      steps: [
        'Enter total electricity bill amount and roommate names.',
        'Specify days present for each roommate and any prepaid amounts.',
        'Generate clear settlement breakdown and copy to roommate group chat.'
      ],
      saveTip: 'Accounts for breaks, vacations, and uneven roommate residency days.'
    },
    note: 'Weighted residency days algorithm ensures fair dormitory cost sharing.'
  },
  countdown: {
    name: 'Exam Countdown & Focus Card',
    task: 'Precise down-to-the-second countdown for college exams with customizable encouragement cards.',
    group: 'Study & Writing',
    guide: {
      intro: 'Countdown timer to crucial academic exams with shareable motivational cards.',
      steps: [
        'Select exam preset (CET-4/6, Graduate Exam, Finals Week) or set custom date.',
        'View real-time countdown down to days, hours, minutes, and seconds.',
        'Generate a clean motivation card image to save as phone wallpaper.'
      ],
      saveTip: 'Countdown persists locally and updates continuously.'
    },
    note: 'Pre-loaded with official Chinese university exam calendar schedules.'
  },
  'md-to-wechat': {
    name: 'Markdown to WeChat Rich Text',
    task: 'Convert Markdown articles and reading notes into high-fidelity inline CSS formatted rich text for WeChat Official Accounts.',
    group: 'Study & Writing',
    guide: {
      intro: 'Convert Markdown notes into clean, mobile-optimized rich text for WeChat Official Accounts.',
      steps: [
        'Paste Markdown text into the left editor.',
        'Select theme palette (Modern Blue, Minimal Green, Warm Amber).',
        'Click Copy for WeChat, then paste directly into WeChat article editor.'
      ],
      saveTip: 'Embeds inline CSS styles directly into clipboard HTML.'
    },
    note: 'Generates inline CSS compatible with WeChat Official Account rich-text editors.'
  },
  wrongbook: {
    name: 'Mistakes Notebook & Active Recall',
    task: 'Record tricky questions and answers locally, practice active recall with hidden answers, and track mastery.',
    group: 'Study & Writing',
    guide: {
      intro: 'Store difficult questions and review via active recall with hidden answers.',
      steps: [
        'Enter problem statement, correct solution, and subject tag.',
        'Practice active recall: recall first, then reveal answer to check.',
        'Mark mastered items and export JSON backup periodically.'
      ],
      saveTip: 'Data is stored in browser localStorage. Export JSON backup before clearing cache.'
    },
    note: 'Promotes active retrieval practice; supports JSON backup and restore.'
  },
  'campus-budget': {
    name: 'Student Living Cost Budget',
    task: 'Set monthly living allowances, log daily dining and study expenses, monitor remaining balances, and export CSV.',
    group: 'Calculations',
    guide: {
      intro: 'Track monthly student expenses across dining, transport, and study supplies.',
      steps: [
        'Set monthly budget allowance.',
        'Record individual expenses with category, description, and amount.',
        'Monitor remaining balance and spending pace; export CSV ledger.'
      ],
      saveTip: 'No account required; records stay strictly on your local device.'
    },
    note: 'Computes spending trajectory and remaining daily budget allowances.'
  },
  'internship-hours': {
    name: 'Internship Hours & Wage Calculator',
    task: 'Log shifts, break times, and hourly pay with cross-midnight support to compute total earned wages.',
    group: 'Calculations',
    guide: {
      intro: 'Log part-time or internship shifts and calculate accumulated earnings.',
      steps: [
        'Enter shift date, clock-in, clock-out times, and unpaid break minutes.',
        'Set hourly wage rate.',
        'View total verified hours, net earnings, and export timesheet.'
      ],
      saveTip: 'Seamlessly handles shifts crossing midnight.'
    },
    note: 'Supports cross-midnight shift calculations and CSV timesheet export.'
  },
  'priority-matrix': {
    name: 'Eisenhower Priority Matrix',
    task: 'Organize academic and life tasks into 4 quadrants (Urgent/Important) to focus on high-leverage activities.',
    group: 'Study & Writing',
    guide: {
      intro: 'Organize college deadlines and personal tasks using the Eisenhower 4-quadrant method.',
      steps: [
        'Add a task with urgency and importance tags.',
        'View tasks categorized into Do First, Schedule, Delegate, and Eliminate quadrants.',
        'Check off completed tasks and export JSON.'
      ],
      saveTip: 'Helps balance exam prep, assignments, social activities, and rest.'
    },
    note: 'Visual 4-quadrant task prioritization with local state retention.'
  },
  'defense-pacer': {
    name: 'Thesis Defense Speech Pacer',
    task: 'Estimate speech duration from draft word counts, rehearse with pacing timers, and avoid exceeding time limits.',
    group: 'Study & Writing',
    guide: {
      intro: 'Rehearse graduation thesis defense presentations with pace tracking.',
      steps: [
        'Paste defense presentation speech manuscript.',
        'Set allocated presentation time (e.g. 10 or 15 minutes) and target words per minute.',
        'Run the interactive rehearsal timer to stay on pace.'
      ],
      saveTip: 'Helps students avoid exceeding defense presentation time limits.'
    },
    note: 'Tracks speaking speed (words/min) and pacing delta in real time.'
  },
  verify: {
    name: 'Claude Desktop Diagnostic Portal',
    task: 'Inspect Claude desktop diagnostic health reports locally to verify installation, signatures, and runtime environment.',
    group: 'Calculations',
    guide: {
      intro: 'Diagnose local Claude desktop application environment and signatures from JSON reports.',
      steps: [
        'Run the diagnostic script on your machine to produce claude-check.json.',
        'Drop the JSON report into this page.',
        'Inspect installation path, app integrity, signature validity, and runtime health.'
      ],
      saveTip: 'Analyzed locally; your diagnostic report is never uploaded.'
    },
    note: 'Non-official local diagnostics tool; inspects local Claude desktop diagnostic JSON.'
  }
};

// Chinese dictionary builder
const zhTools = {};
const enTools = {};

for (const t of tools) {
  const guide = TOOL_BEGINNER_GUIDES[t.id];
  const note = toolNotes[t.id];
  zhTools[t.id] = {
    name: t.name,
    task: t.task,
    group: t.group,
    guide: guide ? {
      intro: guide.intro,
      steps: guide.steps,
      saveTip: guide.saveTip
    } : undefined,
    note: note || undefined
  };

  const en = EN_TOOLS_META[t.id] || {
    name: t.name,
    task: t.task,
    group: t.group,
    guide: guide ? {
      intro: guide.intro,
      steps: guide.steps,
      saveTip: guide.saveTip
    } : undefined,
    note: note || undefined
  };

  enTools[t.id] = en;
}

console.log(`Generated metadata for ${Object.keys(zhTools).length} Chinese tools and ${Object.keys(enTools).length} English tools.`);

// Write zh-CN locale module
const zhContent = `import type { LocaleDictionary } from '../types';

export const zhCN: LocaleDictionary = {
  common: {
    brandName: 'NOVIP',
    brandSlogan: '大学生，别花冤枉钱。',
    brandFreeBadge: '免费 · 无登录 · 无水印',
    nav: {
      home: '工具首页',
      ai: 'AI向导',
      pdfMergeSplit: 'PDF合并拆分',
      handwrite: '手写生成器',
      files: '文件转换',
      references: '参考文献',
      sheets: 'Excel合并',
      photo: '报名照片',
      collegeNav: '大学生导航',
      cost: '免费替代方案',
      wishes: '功能许愿池',
      stats: '网站数据',
      quickSwitch: '⚡ 换工具',
      share: '分享',
      allTools: '全部工具',
      backToHome: '返回工具首页',
      openCommandPalette: '🔍 ⌘K 速查',
      dockHome: '首页',
      dockFiles: '文件',
      dockPhoto: '证件照',
      dockNav: '导航',
      dockAllTools: '工具',
    },
    shell: {
      immersive: '🌌 沉浸深空',
      daylight: '☀️ 纯净日光',
      minimal: '🍃 极简省电',
      sfxOn: '🔊 SFX ON',
      sfxMute: '🔇 SFX',
      sfxTitleOn: 'Web Audio 空间微音效已开启（点击静音）',
      sfxTitleOff: '点击开启 Web Audio 空间微音效反馈',
      telemetryWebgl: 'LOCAL.WEBGL // 全站校园工具纯本机内存隔离运行',
      pulseOrbTitle: '点击释放粒子引力波并切换算力核心遥测状态',
      pulseOrbAria: '释放粒子引力波并切换算力核心状态',
      langSwitchAria: '切换显示语言 / Switch language',
    },
    actions: {
      copy: '复制',
      copied: '已复制',
      copyFailed: '复制失败，请手动长按选中复制',
      download: '下载',
      downloading: '正在下载…',
      save: '保存',
      clear: '清空',
      reset: '重置',
      retry: '重试一次',
      cancel: '取消',
      close: '关闭',
      expand: '展开',
      collapse: '收起',
      preview: '预览',
      shareCard: '分享卡片',
      systemShare: '系统分享',
      selectFile: '选择文件',
      upload: '上传',
      viewMore: '查看更多',
      search: '搜索',
      execute: '开始处理',
      confirm: '确认',
    },
    status: {
      processing: '正在处理…',
      ready: '已就绪',
      completed: '处理完成',
      failed: '处理失败',
      success: '成功',
      loading: '正在加载…',
      offlineReady: '离线就绪',
      localMemory: '本机内存处理',
      noLogin: '无需登录',
      zeroWatermark: '永久无水印',
    },
    workbench: {
      backToLibrary: '← 返回工具库',
      trustBadge: '本机内存运算 · 零上传',
      privacyNote: '隐私：文件与正文仅在本机内存处理，不发送给服务器；刷新或重置会清空。首次载入工具资源需网络。',
      timetablePrivacy: '课表只保存在当前浏览器，不上传',
      adviceTitle: '💡 建议操作：',
    },
    errors: {
      boundaryTitle: '这个工具暂时未能加载',
      boundaryDesc: '别担心，NOVIP 这里没有 VIP 限制，全部工具均在浏览器本地运行。你可以先尝试刷新重试，或使用其他急救工具。',
      chunkLoadDesc: '可能是旧版本资源缓存或网络故障；请先保存其他工具中尚未导出的内容。',
      loopDesc: '已多次尝试重新加载仍未成功，可能是网络问题或浏览器缓存了旧版本。',
      loopActionDesc: '建议：切换 Wi-Fi / 移动数据后重试，或复制链接到系统浏览器（Chrome / Edge）打开 https://novip.site',
      reloadBtn: '刷新并重试',
      defaultErr: '处理失败，请检查输入。',
      emptyResultErr: '结果为空，不提供空白下载。',
    },
    feedback: {
      triggerText: '遇到问题、手机卡顿，或者有新点子？',
      triggerCta: '点击反馈 / 许愿 ❯',
      title: '反馈与许愿 · 站长一对一跟进',
      close: '收起 ✕',
      desc: '你遇到的每一个问题、每一次想要的新功能，都是 NOVIP 变得更好的动力。纯本地隐私保护，反馈内容由你主动复制发送，绝无暗地上传。',
      catWish: '💡 提建议 / 许愿新功能',
      catBug: '🐞 遇到问题 / 功能报错',
      catMobile: '📱 手机 / 微信兼容问题',
      catPraise: '👍 很好用，给作者点赞',
      placeholder: "请把你的想法告诉我们，例如：\\n• '希望能加一个自习室专注番茄钟'\\n• '在安卓手机微信里打开报名照无法保存'...",
      copyBtn: '一键复制反馈（发作者微信）',
      copiedBtn: '✓ 已复制！去微信直接发送',
      wechatBtn: '扫码加作者微信',
      wishlistLink: '查看许愿池 →',
      dialogTitle: '微信联系作者 Steven',
      wechatId: '微信号：StevenGRK',
      wechatNote: '长按可复制或保存二维码图片',
      copyMsg: '已成功复制反馈文案！可直接在微信中发送给作者 StevenGRK',
    },
    share: {
      eyebrow: '📢 觉得好用？',
      title: '分享给身边的同学',
      badge: '免VIP · 无水印 · 纯本地',
      desc: '大学做作业、改格式不用开会员！生成纯净分享卡片或一键复制文案发给同学。',
      copyBtn: '📋 一键复制分享文案',
      copiedBtn: '✓ 文案已复制',
      downloadCardBtn: '🖼️ 下载分享卡片 (PNG)',
      drawingCard: '正在本地 Canvas 绘制分享卡片…',
      previewCard: '预览分享卡片 ▾',
      collapsePreview: '收起卡片预览 ▴',
      systemShareBtn: '📱 系统分享',
      mobileSaveTip: '手机端可长按上方图片直接保存或转发',
      copySuccessMsg: '✓ 分享文案已复制，可直接粘贴发到微信群或发给同学！',
      cardSuccessMsg: '✓ 分享卡片已生成并下载！可直接发送到微信朋友圈或班级群。',
      footerHint: '电脑与手机浏览器即开即用',
    },
    author: {
      eyebrow: 'CONTACT / 联系作者',
      title: '有问题，或者有个好主意？',
      desc: '功能建议、使用反馈，都可以通过微信联系作者。',
      qrBtn: '扫码联系作者 · 点击放大',
      wechatLabel: '作者微信',
      copyWechat: '复制微信号',
      copiedWechat: '已复制微信号：StevenGRK',
      dialogTitle: '微信联系作者',
      saveQr: '保存二维码原图',
    },
    footer: {
      privacyNotice: '文件与内容只在当前浏览器处理，刷新会清空',
      openSourceLicense: '开源许可',
      notices: '第三方开源通知',
    },
  },
  home: {
    hero: {
      title: '大学生，别花冤枉钱。',
      chunks: ['大学生，', '别花冤枉钱。'],
      subtitle: '收录 {count} 款高频校园工具：考试报名照换底、A4 证件拼版打印、期末作业合并、真实软面抄手写、大照片精准压缩到 100KB。纯浏览器端侧处理，',
      highlight: '零上传、免登录、无广告、永久无水印。',
      metricTools: '款高频工具',
      metricLocal: '本机内存处理',
      metricFree: '元免登录零水印',
      ctaFlagship: '探索高频工具 ↓',
      ctaAi: '问问 NOVIP AI ❯',
    },
    island: {
      tag: '安全绿标',
      desktopText: '照片和文件只留在你的手机里 · 绝不上传',
      mobileText: '端侧计算 · 照片绝不上传',
      toolsChip: '{count} 款工具',
      expandTip: '展开说明 ▾',
      pwaTitle: '📱 添加到手机主屏幕体验更佳：',
      pwaDesc: '在手机浏览器点击底部「分享」或「菜单」按钮，选择「添加到主屏幕」，即可像原生 App 一样随时一键秒开！',
      status1Title: '零上传隐私保护',
      status1Desc: '纯前端运行，文件数据绝不上传服务器',
      status2Title: '零会员套路',
      status2Desc: '所有功能 100% 免费，永久无广告、无二次付费',
      status3Title: '无任何水印',
      status3Desc: '导出文件原汁原味，不加任何平台水印',
      status4Title: '离线就绪',
      status4Desc: '静态资源离线缓存，无网络也可继续使用',
    },
    showcase: {
      tabPhoto: '报名照片换底色',
      tabPdf: '多份课件论文合并',
      tabGrades: '平时分反推期末成绩',
      tabCompress: '超大图片精准压缩',
      badgePhoto: '四六级 · 考研 · 教资必备',
      badgePdf: '期末作业 · 实验报告神器',
      badgeGrades: '保研 · 期末冲优备考',
      badgeCompress: '学信网 · 研招网秒过',
      titlePhoto: '考试报名照片一键合规换底色',
      titlePdf: '多份 PDF 课件与实验报告自由拼装',
      titleGrades: '期末考多少分才能及格/冲 85？',
      titleCompress: '精准压缩到 100KB 以内，绝不模糊',
      descPhoto: '一寸/二寸/480×640 报名照红白蓝底色一键切换，纯本地 Canvas 快速抠图，自动控制在 100KB 内，隐私不泄露。',
      descPdf: '多份课件按顺序拖拽拼接，自由选择保留页或剔除空白页，不限制页数和大小，100% 浏览器内算完直接下。',
      descGrades: '输入平时成绩和权重（如平时占 40% 得 75 分），一秒算出期末考试必须考多少分才能总评过线或拿 85 分冲保研。',
      descCompress: '独创二分法像素无损重采样引擎，把 5MB~20MB 的手机大照片精确压到 100KB/50KB 阈值下，杜绝平台上传报错。',
      ctaPhoto: '去换底色 →',
      ctaPdf: '去拼装 PDF →',
      ctaGrades: '去反推成绩 →',
      ctaCompress: '去精准压缩 →',
      bgBlue: '标准蓝底',
      bgWhite: '纯洁白底',
      bgRed: '喜庆红底',
    },
    ribbon: {
      btnPdf: 'PDF 合并与拆分',
      btnPhoto: '报名照合规体检',
      btnCompress: 'PDF 无损瘦身',
      spec1: '0 元永久免费',
      spec2: 'WebAssembly 本机算力',
      spec3: '免登录零水印',
    },
    everyday: {
      badge: 'NEWBIE FRIENDLY',
      title: '今天想办什么事？点一下直接开始',
      subtitle: '不用到处找，常用需求一站搞定',
      card1Title: '做考试报名照',
      card1Desc: '一寸 / 二寸换蓝底、白底、红底，自动压到 100KB 内',
      card1Pill: '四六级 · 考研 · 教资必备',
      card1Cta: '去制作 ❯',
      card2Title: '交作业与拼文件',
      card2Desc: '多份 PDF 按顺序合并成一个、转 Word 或图片、批量加页码',
      card2Pill: '作业 · 实验报告 · 材料汇总',
      card2Cta: '去合并 ❯',
      card3Title: '真实软面抄手写',
      card3Desc: '纯文本一秒生成逼真手写作业字迹，自带横线格纸张',
      card3Pill: '学习心得 · 检讨书 · 读书笔记',
      card3Cta: '去生成 ❯',
      card4Title: '查学信网 / 研招网',
      card4Desc: '大学高频官方系统合集，无广告纯净直达，防钓鱼防假网',
      card4Pill: '学籍 · 考研 · 四六级查分',
      card4Cta: '去导航 ❯',
    },
    flagship: {
      title: '⭐️ 大学高频急救神器',
      subtitle: '做作业、考试报名、期末复习用得最多的 4 款工具',
    },
    search: {
      placeholder: '搜工具名、场景痛点（如：PDF压缩、去白边、四六级照片、算绩点、请假）...',
      badge: 'GROK SMART INTENT',
      scenarioAll: '全部',
      scenarioAcademic: '做作业/写论文',
      scenarioExam: '报名与体检',
      scenarioCampus: '生活与课表',
      scenarioFiles: '文档与转换',
      scenarioDev: '代码与计算',
      clearSearch: '清空搜索',
      resultCount: '找到 {count} 款相关工具',
      noResultTitle: '没有找到匹配的工具',
      noResultDesc: '你可以尝试更换更通俗的关键词（如“压缩”、“照片”、“课表”），或向功能许愿池提交需求。',
    },
    springboard: {
      title: 'App 资源库',
      expandAll: '展开全部 {count} 款 App ❯',
      collapseAll: '收起主屏 (精选 16 款)',
    },
    novip20: {
      badge: 'NOVIP 2.0',
      title: '新一代离线校园神器',
      subtitle: '错题本、生活费账本、实习工时、四象限任务与答辩测速，全在浏览器纯本地运行。',
      cardWrongbookTitle: '本机错题本',
      cardWrongbookDesc: '主动回忆复习法，支持掌握状态追踪与 JSON 备份。',
      cardBudgetTitle: '生活费账本',
      cardBudgetDesc: '分类记账、实时监控预算剩余，可导出 CSV 对账。',
      cardHoursTitle: '实习工时结算',
      cardHoursDesc: '跨午夜班次精准计算，自动统计累计工时与预计报酬。',
      cardMatrixTitle: '四象限任务',
      cardMatrixDesc: '紧急与重要二维拆分，把时间投入真正高价值的事。',
      cardDefenseTitle: '答辩测速与计时',
      cardDefenseDesc: '讲稿字数智能测算演练时长，倒计时排练防超时。',
    },
    faq: {
      title: '常见疑问解答',
      q1: 'NOVIP 真的完全免费吗？后期会收费吗？',
      a1: '是的，NOVIP 承诺永久免费。我们由大学开发者团队维护，采用纯浏览器前端运算架构，零高昂服务器算力成本，因此不需要向大家收取任何开卡会员费。',
      q2: '我的照片和作业文档会被上传到服务器吗？',
      a2: '绝不上传。所有 PDF 处理、照片裁剪压缩、手写排版、课表计算均直接在你的手机或电脑浏览器内存（WebAssembly & HTML5 Canvas）中完成，断网亦可继续使用。',
      q3: '手机微信里使用体验卡顿或无法下载怎么办？',
      a3: '微信内置浏览器对大文件内存有限制。遇到较大 PDF 或多图拼接时，点击微信右上角「...」选择「在浏览器打开」（如 Chrome、Safari 或系统自带浏览器），体验更流畅。',
      q4: '我想提新功能需求，或者工具报错怎么联系作者？',
      a4: '全站页面底部均提供反馈入口与作者个人微信（StevenGRK）。欢迎添加好友直接向开发者提出痛点和建议，我们将持续迭代上线纯免费版！',
    },
  },
  tools: ${JSON.stringify(zhTools, null, 2)},
  searchAliases: {
    developer: ['json', 'md5', 'sha', 'hmac', 'jwt', 'base64', 'url', 'uuid', '密码生成'],
    files: ['pdf转ppt', 'pdf转word', 'ppt转pdf', 'word转pdf', 'pdf转图片', '图片转pdf', 'pdf2ppt', 'pdf2word', '旋转删页', '格式转换', '基础转换', 'pdf旋转', 'pdf压缩', '压缩pdf', 'pdf变小'],
    photo: ['照片100kb', '照片压到100kb', '证件照', '一寸', '二寸', '480640', '报名照片', '480×640'],
    images: ['图片压缩', '批量改名', '批量缩放', 'png转jpg', 'jpg转png', 'webp', '压缩照片', '重命名zip'],
    ocr: ['图片提取文字', '图片转文字', '识别文字', 'ocr', '扫描pdf识别', '提取可编辑文字'],
    references: ['参考文献', '引用', 'citation', 'gbt7714', 'gb/t7714'],
    sheets: ['合并excel', '合并表格', '多份报名表合成一张'],
    resume: ['做简历', '免费简历', 'cv', '无水印pdf'],
    scan: ['扫描件变清晰', '扫描增强', '去阴影', '背景减弱'],
    ppt: ['ppt体积太大', 'ppt瘦身', 'ppt压缩', 'pptx压缩', '压缩嵌入图片'],
    'ppt-extract': ['ppt图片提取', '提取ppt图片', '课件图片导出', 'pptx图片导出', 'ppt原图', 'ppt素材提取', '幻灯片图片', 'zip', 'csv清单'],
    privacy: ['pdf隐私', '清除作者', '删除元数据'],
    materials: ['报名材料', '附件检查', '像素大小检查'],
    wishes: ['wps让我开会员怎么办', '付费墙', '建议', '反馈'],
    cost: ['免费替代', 'wps会员', '会员费用', '单次费用'],
    timestamp: ['时间戳', 'unix时间', '日期转时间戳', '时间戳转日期', '毫秒', '时间转换', 'utc', '10位', '13位'],
    text: ['字数统计', '文本统计', '去重行', '空行', '文本整理', '排序行', '全角半角', '标点转换'],
    finance: ['房贷', '月供', '等额本息', '等额本金', '利息', '复利', '单利', '提前还款', '贷款计算器', '按揭'],
    health: ['bmi', '体脂率', '体脂', '基础代谢', 'bmr', 'tdee', '卡路里', '每日热量', '健康体重', '减脂'],
    'color-picker': ['取色', '吸色', '颜色', '色板', '主色', 'hex', 'rgb', 'hsl', '调色板'],
    stitch: ['拼长图', '长图拼接', '图片拼接', '拼图', '纵向拼接', '横向拼接'],
    'pdf-page-number': ['加页码', 'pdf页码', '页码', '编号', '9宫格'],
    'image-watermark': ['图片加水印', '图片水印', '证件水印', '身份证加水印', '防盗用水印', '仅供使用', '打水印', '照片加水印', '日期水印', 'logo水印', '批量水印'],
    'pdf-watermark': ['pdf水印', 'pdf加水印', '文档水印', '全页密铺'],
    'pdf-crop': ['pdf裁剪', '裁剪pdf', '裁边', '页边距', '去掉白边', '去白边'],
    timetable: ['课程表', '课表', '排课', '上课时间', '单双周', '单周', '双周', 'ics', '日历', '上课提醒', '课前提醒', 'wakeup', '超级课程表'],
    ai: ['ai', 'ai助手', '人工智能', '智能向导', '向导', '智能问答', '推荐工具', '帮我找工具', '问问ai', '大学助手'],
    'leave-helper': ['请假', '请假条', '请假理由'],
    'material-collector': ['收作业', '收材料', '核对名单', '材料收集'],
    'file-organizer': ['批量重命名', '文件改名', '编号重命名'],
    'batch-pdf': ['批量pdf', 'pdf转png'],
    handwrite: ['手写', '手写生成', '手写体'],
    background: ['抠图', '换底色', '红底蓝底白底'],
    'docx-check': ['docx检查', '论文格式检查', '行距页边距'],
    compare: ['文档对比', '文字比较', '差异对比'],
    course: ['课程设计', '答辩ppt', '报告提纲'],
    'table-clean': ['excel清洗', 'csv清洗', '表格去重'],
    lab: ['实验数据', '标准差', '相对误差', '线性拟合'],
    grades: ['成绩反推', '期末考多少分', 'gpa', '绩点'],
    'ppt-generate': ['ppt生成', 'pptx生成', '答辩ppt', '做ppt', '大纲生成', '开题报告ppt', '课程设计ppt', '路演ppt', 'pptxgenjs'],
    'pdf-form': ['pdf填表', 'pdf表格填写', 'pdf签名', 'pdf签字', '奖学金申请表', '缓考申请表', '假条审批', '社团申请表', 'pdfme'],
    'image-compress': ['图片精准压缩', '限制100kb', '压到100kb', '学信网图片压缩', '考研网图片', 'squoosh', '精确压缩', '限制kb'],
    flowchart: ['流程图', 'mermaid', '架构图', '时序图', 'er图', '算法流程图', '甘特图', '思维导图'],
    'media-converter': ['音视频转换', '提取音频', '视频提取mp3', 'mp4转mp3', '视频转gif', 'gif制作', '录音转mp3', '音频裁剪'],
    'web-to-apk': ['apk', '安卓', '打包', 'pwabuilder', 'bubblewrap', 'pwa', '网站转app', '生成apk', '安卓安装包', '网站转apk', '做个app', 'android', 'apk打包'],
    'pdf-merge-split': ['pdf合并', 'pdf拆分', '合并pdf', '拆分pdf', '合并拆分', 'pdf合并拆分', 'pdf拼接', 'pdf提取页面', '按页拆分', 'pdf提取', '提取页面', 'pdf提取页', 'pdf删页', '删除pdf页面', 'pdf去页', '删页', '提取页', 'merge', 'split'],
    'pdf-compress': ['压缩pdf', 'pdf压缩', 'pdf太大', 'pdf变小', 'pdf瘦身', '缩小pdf', 'pdf降体积', 'pdf过大', '压缩'],
    'photo-check': ['证件照体检', '照片体检', '照片合格检查', '照片诊断', '四六级照片', '考研照片', '教资照片', '照片检测', '底色检测'],
  },
  ai: {
    title: 'NOVIP 助手',
    desc: '连接优质免费大模型（优先调用 Google Gemini Flash），结合全站 {count} 款实用免充值工具，为大学生提供真诚、高智商的学业答疑、文案起草与工具直达。',
    statusBadge: '🛡️ 端侧学业规则引擎 (零配置)',
    configBtn: '配置 API',
    clearBtn: '清空',
    wechatHint: '💡 微信内浏览：推荐卡片支持一键秒开对应工具；文案草稿支持一键复制。',
    welcomeMsg: '你好！我是 **NOVIP AI 助手**。我是专为大学生打造的本地学业与文件难题智能向导。',
    queryPlaceholder: '向 NOVIP AI 提问学业问题或工具需求（如：四六级照片修改、期末算绩点、生病找辅导员请假）...',
    sendBtn: '发送',
    thinking: '正在思考并整理最适解法…',
    copyDraft: '一键复制草稿',
    copiedDraft: '✓ 已复制草稿',
  },
};
`;

writeFileSync(join(root, 'src/i18n/locales/zh-CN.ts'), zhContent);

// Write en-US locale module
const enContent = `import type { LocaleDictionary } from '../types';

export const enUS: LocaleDictionary = {
  common: {
    brandName: 'NOVIP',
    brandSlogan: 'College Life Without the VIP Paywall.',
    brandFreeBadge: 'Free · No Login · No Watermark',
    nav: {
      home: 'Home',
      ai: 'AI Guide',
      pdfMergeSplit: 'PDF Merge & Split',
      handwrite: 'Handwriting Generator',
      files: 'File Converter',
      references: 'Citations (GB/T 7714)',
      sheets: 'Excel Merge',
      photo: 'ID Photo',
      collegeNav: 'College Portals',
      cost: 'Free Alternatives',
      wishes: 'Feature Wishlist',
      stats: 'Site Stats',
      quickSwitch: '⚡ Switch Tool',
      share: 'Share',
      allTools: 'All Tools',
      backToHome: 'Back to Home',
      openCommandPalette: '🔍 ⌘K Palette',
      dockHome: 'Home',
      dockFiles: 'Files',
      dockPhoto: 'ID Photo',
      dockNav: 'Portals',
      dockAllTools: 'Tools',
    },
    shell: {
      immersive: '🌌 Deep Space',
      daylight: '☀️ Daylight',
      minimal: '🍃 Eco Minimal',
      sfxOn: '🔊 SFX ON',
      sfxMute: '🔇 SFX',
      sfxTitleOn: 'Web Audio spatial micro-sound enabled (click to mute)',
      sfxTitleOff: 'Click to enable Web Audio spatial micro-sound feedback',
      telemetryWebgl: 'LOCAL.WEBGL // Campus tools running in isolated browser memory',
      pulseOrbTitle: 'Click to emit particle gravitational wave and cycle telemetry',
      pulseOrbAria: 'Emit particle gravitational wave and cycle telemetry',
      langSwitchAria: 'Switch display language / 切换显示语言',
    },
    actions: {
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy unavailable, please select text and copy manually',
      download: 'Download',
      downloading: 'Downloading...',
      save: 'Save',
      clear: 'Clear',
      reset: 'Reset',
      retry: 'Retry',
      cancel: 'Cancel',
      close: 'Close',
      expand: 'Expand',
      collapse: 'Collapse',
      preview: 'Preview',
      shareCard: 'Share Card',
      systemShare: 'System Share',
      selectFile: 'Select File',
      upload: 'Upload',
      viewMore: 'View More',
      search: 'Search',
      execute: 'Execute',
      confirm: 'Confirm',
    },
    status: {
      processing: 'Processing...',
      ready: 'Ready',
      completed: 'Completed',
      failed: 'Failed',
      success: 'Success',
      loading: 'Loading...',
      offlineReady: 'Offline Ready',
      localMemory: 'In-Memory Compute',
      noLogin: 'No Login Required',
      zeroWatermark: '100% Watermark-Free',
    },
    workbench: {
      backToLibrary: '← Back to Library',
      trustBadge: 'Client-Side Compute · Zero Upload',
      privacyNote: 'Privacy: Files and inputs are processed solely in local memory and never transmitted to servers; refreshing resets temporary buffers. Initial tool runtime requires network.',
      timetablePrivacy: 'Schedule stored solely in current browser localStorage, zero server transmission.',
      adviceTitle: '💡 Recommended Action:',
    },
    errors: {
      boundaryTitle: 'Tool Failed to Load',
      boundaryDesc: 'No worries — NOVIP has zero VIP walls; all tools run locally in browser memory. Try refreshing to retry or use other utilities.',
      chunkLoadDesc: 'Could be stale cached assets or temporary network interruption. Ensure unsaved inputs in other tabs are saved before reload.',
      loopDesc: 'Repeated load attempts unsuccessful, likely network connectivity issue or stale cache.',
      loopActionDesc: 'Recommendation: Switch Wi-Fi / mobile data and retry, or open https://novip.site in Chrome / Edge.',
      reloadBtn: 'Refresh & Retry',
      defaultErr: 'Processing failed, please check your input.',
      emptyResultErr: 'Output is empty; cannot generate empty file.',
    },
    feedback: {
      triggerText: 'Found a bug, mobile glitch, or have a new tool idea?',
      triggerCta: 'Feedback & Wishes ❯',
      title: 'Feedback & Feature Wishlist · Direct Follow-up',
      close: 'Close ✕',
      desc: 'Every bug you report and feature you wish for empowers NOVIP. Client-side privacy guaranteed: feedback is copied by you manually, never quietly uploaded.',
      catWish: '💡 New Feature Suggestion / Wish',
      catBug: '🐞 Bug Report / Processing Error',
      catMobile: '📱 Mobile / WeChat Compatibility Issue',
      catPraise: '👍 Love the tool, kudos to author',
      placeholder: "Tell us your thoughts, e.g.:\\n• 'Would love a study room pomodoro timer'\\n• 'Android WeChat cannot save ID photo'...",
      copyBtn: 'Copy Feedback (Send via WeChat)',
      copiedBtn: '✓ Copied! Paste directly in WeChat',
      wechatBtn: 'Scan WeChat QR',
      wishlistLink: 'View Wishlist →',
      dialogTitle: 'WeChat Author Steven',
      wechatId: 'WeChat ID: StevenGRK',
      wechatNote: 'Long-press to copy ID or save QR image',
      copyMsg: 'Feedback text copied! Send directly to WeChat author: StevenGRK',
    },
    share: {
      eyebrow: '📢 Love NOVIP?',
      title: 'Share with Classmates & Friends',
      badge: 'Free · No Watermark · 100% Local',
      desc: 'Do college assignments and format papers without paid VIP subscriptions! Generate clean share cards or copy text in one click.',
      copyBtn: '📋 Copy Share Pitch',
      copiedBtn: '✓ Pitch Copied',
      downloadCardBtn: '🖼️ Download Share Card (PNG)',
      drawingCard: 'Rendering share card on local Canvas...',
      previewCard: 'Preview Share Card ▾',
      collapsePreview: 'Collapse Preview ▴',
      systemShareBtn: '📱 System Share',
      mobileSaveTip: 'On mobile, long-press the card above to save or forward',
      copySuccessMsg: '✓ Share text copied! Paste into class group chats or send to friends.',
      cardSuccessMsg: '✓ Share card generated and downloaded! Ready to share on social media or class chats.',
      footerHint: 'Runs directly in desktop & mobile browsers',
    },
    author: {
      eyebrow: 'CONTACT / Author',
      title: 'Have Questions or a Great Idea?',
      desc: 'Feature requests and bug reports are welcome directly via WeChat.',
      qrBtn: 'Scan to connect with author · Click to expand',
      wechatLabel: 'Author WeChat',
      copyWechat: 'Copy WeChat ID',
      copiedWechat: 'Copied WeChat ID: StevenGRK',
      dialogTitle: 'Connect with Author',
      saveQr: 'Save Original QR Code',
    },
    footer: {
      privacyNotice: 'Files and contents processed strictly in browser memory; refreshing clears buffers',
      openSourceLicense: 'Open Source Licenses',
      notices: 'Third-Party Open Source Notices',
    },
  },
  home: {
    hero: {
      title: 'College Life Without the VIP Paywall.',
      chunks: ['College Life,', 'Without the VIP Paywall.'],
      subtitle: 'Featuring {count} essential privacy-first campus utilities: ID photo background, A4 document layout, PDF merge & split, realistic handwriting generator, and precision 100KB image compressor. 100% client-side, ',
      highlight: 'zero upload, no login, ad-free, and permanently watermark-free.',
      metricTools: 'Campus Utilities',
      metricLocal: 'Local In-Memory Compute',
      metricFree: 'Free Without Watermark',
      ctaFlagship: 'Explore High-Frequency Tools ↓',
      ctaAi: 'Ask NOVIP AI ❯',
    },
    island: {
      tag: 'Privacy Shield',
      desktopText: 'Photos and files remain solely on your device · Never uploaded',
      mobileText: 'Client-side compute · Photos never leave device',
      toolsChip: '{count} Tools',
      expandTip: 'Expand Info ▾',
      pwaTitle: '📱 Add to Home Screen for Native Experience:',
      pwaDesc: 'Tap the Share or Menu button in your mobile browser, select "Add to Home Screen", and launch instantly like a native app anytime!',
      status1Title: 'Zero-Upload Privacy Protection',
      status1Desc: 'Runs 100% client-side; documents and photos never touch cloud servers',
      status2Title: 'Zero Paywall Traps',
      status2Desc: 'All features are 100% free with zero ads, subscriptions, or hidden paywalls',
      status3Title: 'Zero Watermarks',
      status3Desc: 'Export original pristine files without platform logos or watermarks',
      status4Title: 'Offline Ready',
      status4Desc: 'Cached static assets allow full functionality even without an internet connection',
    },
    showcase: {
      tabPhoto: 'ID Photo Background',
      tabPdf: 'PDF Document Merge',
      tabGrades: 'Final Exam Target Score',
      tabCompress: 'Precise Image Compression',
      badgePhoto: 'CET-4/6 · Graduate Exam · License',
      badgePdf: 'Final Assignments · Lab Reports',
      badgeGrades: 'GPA Target · Exam Revision',
      badgeCompress: 'Official Exam Portals Ready',
      titlePhoto: 'One-Click Official Exam Photo Background Color',
      titlePdf: 'Merge Multi-Doc Slides & Lab Reports Seamlessly',
      titleGrades: 'What Final Exam Score Do I Need to Pass / Get 85?',
      titleCompress: 'Compress Accurately Under 100KB Without Blur',
      descPhoto: 'Switch 1-inch, 2-inch, or 480×640 exam photos between blue, white, and red in-browser using HTML5 Canvas matting. Automatically targets under 100KB without privacy leakage.',
      descPdf: 'Drag-and-drop multiple lecture slide PDFs in custom order, selectively keep or omit pages, and merge without limits on page counts or file size — completely inside your browser.',
      descGrades: 'Input your regular coursework mark and weight (e.g. 75 points with 40% weight), and instantly compute the exact exam score required to pass or achieve an 85 for honor scholarships.',
      descCompress: 'Innovative binary-search resampling engine shrinks 5MB–20MB smartphone photos accurately below the strict 100KB/50KB thresholds required by government examination portals.',
      ctaPhoto: 'Replace Background →',
      ctaPdf: 'Merge PDF Documents →',
      ctaGrades: 'Reverse Calculate Grade →',
      ctaCompress: 'Compress Image →',
      bgBlue: 'Standard Blue',
      bgWhite: 'Pristine White',
      bgRed: 'Festive Red',
    },
    ribbon: {
      btnPdf: 'PDF Merge & Split',
      btnPhoto: 'ID Photo Compliance Doctor',
      btnCompress: 'Lossless PDF Slimmer',
      spec1: '$0 Permanently Free',
      spec2: 'WebAssembly Client Power',
      spec3: 'No Login & No Watermark',
    },
    everyday: {
      badge: 'NEWBIE FRIENDLY',
      title: 'What do you need done today? One click to start',
      subtitle: 'No more searching across paid tools — all student essentials in one place',
      card1Title: 'Create Exam ID Photo',
      card1Desc: '1-inch / 2-inch background color change (blue, white, red), auto-compressed under 100KB',
      card1Pill: 'CET · Graduate Exam · Teacher License',
      card1Cta: 'Create ❯',
      card2Title: 'Submit Assignments & Merge',
      card2Desc: 'Merge multiple PDFs in sequence, convert to Word or images, batch add page numbers',
      card2Pill: 'Assignments · Lab Reports · Documents',
      card2Cta: 'Merge ❯',
      card3Title: 'Realistic Handwriting',
      card3Desc: 'Turn typed text into authentic notebook handwriting with customizable lined paper in seconds',
      card3Pill: 'Study Reports · Reflections · Notes',
      card3Cta: 'Generate ❯',
      card4Title: 'Official College Portals',
      card4Desc: 'Ad-free directory of verified Chinese college exam, degree, and certification portals',
      card4Pill: 'CHSI · Graduate Exam · Score Checks',
      card4Cta: 'Browse ❯',
    },
    flagship: {
      title: '⭐️ Essential College Powerhouses',
      subtitle: 'The 4 most frequented tools for assignments, exam registration, and final revision',
    },
    search: {
      placeholder: 'Search by tool name or scenario (e.g. compress PDF, ID photo, GPA, timetable, watermark)...',
      badge: 'GROK SMART INTENT',
      scenarioAll: 'All',
      scenarioAcademic: 'Homework / Thesis',
      scenarioExam: 'Exams & Registration',
      scenarioCampus: 'Campus Life & Schedule',
      scenarioFiles: 'Documents & Conversion',
      scenarioDev: 'Code & Calculations',
      clearSearch: 'Clear search',
      resultCount: 'Found {count} matching tools',
      noResultTitle: 'No Matching Tools Found',
      noResultDesc: 'Try using simpler keywords (e.g. "compress", "photo", "timetable", "gpa"), or submit a request to the Feature Wishlist.',
    },
    springboard: {
      title: 'App Library',
      expandAll: 'Show All {count} Apps ❯',
      collapseAll: 'Collapse to Featured (16 Apps)',
    },
    novip20: {
      badge: 'NOVIP 2.0',
      title: 'Next-Gen Offline Campus Suite',
      subtitle: 'Mistakes notebook, living cost budget, internship hours, priority matrix, and defense speech pacer — all running purely in your browser.',
      cardWrongbookTitle: 'Mistakes Notebook',
      cardWrongbookDesc: 'Active recall methodology with mastery tracking and JSON backup.',
      cardBudgetTitle: 'Living Cost Budget',
      cardBudgetDesc: 'Categorized expense tracker with real-time budget remaining and CSV export.',
      cardHoursTitle: 'Internship Wage Tracker',
      cardHoursDesc: 'Cross-midnight shift calculations with cumulative hours and wage summaries.',
      cardMatrixTitle: 'Eisenhower Priority Matrix',
      cardMatrixDesc: 'Two-dimensional task sorting to invest energy where it truly counts.',
      cardDefenseTitle: 'Defense Speech Pacer',
      cardDefenseDesc: 'Estimate speech duration from draft words and rehearse with countdown timers.',
    },
    faq: {
      title: 'Frequently Asked Questions',
      q1: 'Is NOVIP genuinely 100% free? Will it charge later?',
      a1: 'Yes, NOVIP is committed to being permanently free. Maintained by a university developer team, we utilize in-browser client-side computing with near-zero server infrastructure costs, completely eliminating the need to charge student subscription fees.',
      q2: 'Are my photos, resumes, and homework documents uploaded to servers?',
      a2: 'Never. All PDF processing, image cropping, handwriting synthesis, and calculations run directly inside your device browser memory via WebAssembly and HTML5 Canvas. You can even disconnect your internet and continue working.',
      q3: 'What if mobile WeChat feels slow or fails to download large files?',
      a3: 'The WeChat in-app browser enforces strict memory caps on large files. For large PDFs or image stitching, tap the "..." menu in WeChat and select "Open in Default Browser" (such as Chrome or Safari) for maximum performance.',
      q4: 'How can I request new tools or report an issue directly?',
      a4: 'Every page features a Feedback entry in the footer along with author WeChat (StevenGRK). Feel free to reach out directly to suggest new features or report issues — we continuously build free tools for student needs!',
    },
  },
  tools: ${JSON.stringify(enTools, null, 2)},
  searchAliases: {
    developer: ['developer', 'code', 'json', 'format', 'hash', 'md5', 'sha256', 'jwt', 'base64', 'uuid', 'password', 'crypto'],
    timestamp: ['timestamp', 'unix', 'epoch', 'date', 'utc', 'seconds', 'milliseconds', 'time converter'],
    text: ['word count', 'character count', 'deduplicate', 'sort lines', 'trim lines', 'clean text', 'case converter'],
    finance: ['mortgage', 'loan', 'interest', 'monthly payment', 'amortization', 'installments', 'debt'],
    health: ['bmi', 'body fat', 'calories', 'bmr', 'tdee', 'weight', 'health calculator'],
    'color-picker': ['color picker', 'eyedropper', 'palette', 'hex', 'rgb', 'hsl', 'sample color'],
    stitch: ['stitch images', 'long image', 'combine screenshots', 'merge photos', 'vertical stitch'],
    'pdf-page-number': ['pdf page number', 'add page numbers', 'paginate', 'numbering', 'pdf pages'],
    'pdf-crop': ['crop pdf', 'trim margins', 'remove white borders', 'cut pdf margins', 'pdf crop'],
    'pdf-watermark': ['pdf watermark', 'protect pdf', 'text watermark', 'diagonal watermark'],
    'image-watermark': ['image watermark', 'id watermark', 'photo protection', 'stamp watermark'],
    timetable: ['timetable', 'schedule', 'class schedule', 'calendar', 'ics export', 'odd even weeks', 'course timetable'],
    'leave-helper': ['leave request', 'sick leave', 'counselor message', 'absence notice', 'professor email'],
    'material-collector': ['material collector', 'homework audit', 'check submissions', 'roster check', 'class monitor'],
    'file-organizer': ['batch rename', 'file organizer', 'rename zip', 'number files', 'sequential names'],
    'batch-pdf': ['batch pdf', 'pdf to images', 'extract pages', 'bulk pdf'],
    materials: ['material checker', 'exam photo compliance', 'dimensions check', 'file size audit'],
    ppt: ['compress ppt', 'slim pptx', 'reduce ppt size', 'shrink presentation', 'ppt images'],
    'ppt-extract': ['extract ppt images', 'extract media', 'powerpoint pictures', 'export slides images'],
    scan: ['scan enhancer', 'document scan', 'photocopy filter', 'remove shadows', 'black and white scan'],
    privacy: ['pdf privacy', 'remove metadata', 'clean author', 'sanitize pdf', 'blind review'],
    wishes: ['wishlist', 'anti paywall', 'request tool', 'feedback'],
    cost: ['vip cost', 'paywall alternatives', 'free software', 'compare pricing'],
    handwrite: ['handwriting', 'handwritten notes', 'simulate handwriting', 'ruled paper', 'handwriting generator'],
    'pdf-merge-split': ['merge pdf', 'split pdf', 'combine pdf', 'extract pdf pages', 'delete pdf pages', 'reorder pdf'],
    'pdf-compress': ['compress pdf', 'reduce pdf size', 'shrink pdf', 'pdf resample', 'smaller pdf'],
    'photo-check': ['photo check', 'id photo check', 'exam photo audit', '480x640', 'photo compliance doctor'],
    files: ['convert file', 'pdf to word', 'word to pdf', 'ppt to pdf', 'pdf to images', 'format converter'],
    photo: ['id photo', '1 inch', '2 inch', 'exam photo', 'passport photo', 'crop photo', '100kb photo'],
    images: ['batch resize', 'compress images', 'convert png jpg', 'bulk image converter'],
    background: ['change background', 'blue background', 'white background', 'red background', 'photo matting'],
    ocr: ['ocr', 'extract text', 'image to text', 'tesseract', 'scan to text'],
    references: ['references', 'gb/t 7714', 'citations', 'bibliography', 'citation formatter', 'thesis references'],
    'docx-check': ['docx check', 'thesis layout', 'word formatting', 'heading hierarchy', 'thesis format'],
    compare: ['text diff', 'compare documents', 'document comparison', 'side by side diff'],
    resume: ['resume builder', 'student cv', 'curriculum vitae', 'clean resume pdf', 'free resume'],
    ai: ['ai guide', 'gemini', 'academic assistant', 'homework helper', 'ai tool recommend'],
    course: ['course project', 'project planner', 'defense outline', 'presentation roadmap'],
    sheets: ['merge excel', 'combine spreadsheets', 'merge csv', 'table merge'],
    'table-clean': ['clean csv', 'deduplicate table', 'data cleaning', 'normalize table'],
    lab: ['lab data', 'linear regression', 'standard deviation', 'least squares', 'curve fitting'],
    grades: ['gpa calculator', 'final exam needed', 'target score', 'weighted gpa', 'credit points'],
    'ppt-generate': ['generate ppt', 'presentation outline', 'defense slides', 'slide generator'],
    'pdf-form': ['fill pdf', 'pdf form', 'sign pdf', 'handwritten signature', 'application form'],
    'image-compress': ['precise image compress', 'compress to 100kb', '50kb photo', 'squoosh', 'image kb limit'],
    flowchart: ['flowchart', 'mermaid', 'sequence diagram', 'uml', 'er diagram', 'diagram editor'],
    'media-converter': ['extract mp3', 'video to audio', 'make gif', 'media converter', 'mp4 to mp3'],
    'web-to-apk': ['web to apk', 'pwa to apk', 'package android', 'apk generator', 'website to app'],
    qr: ['qr code', 'generate qr', 'scan qr', 'custom qr code', 'decode qr'],
    'random-pick': ['random picker', 'lucky draw', 'random sequence', 'group shuffle', 'fair draw'],
    'id-card-layout': ['a4 id card', 'print id card', '1:1 scale id', 'copy id card', 'double sided id'],
    'split-bill': ['split bill', 'roommate expenses', 'dinner split', 'settle debts', 'dutch treat'],
    'class-fund': ['class fund', 'fund ledger', 'class accounting', 'transparent notice'],
    'exam-plan': ['exam plan', 'countdown planner', 'study milestones', 'finals schedule'],
    'composite-score': ['composite score', 'merit score', 'scholarship calculation', 'student ranking'],
    'fitness-test': ['fitness test', 'student fitness', 'physical test standards', 'pull ups run'],
    'internship-tax': ['internship tax', 'student tax', 'withholding tax', 'tax refund calculator'],
    'student-loan': ['student loan', 'loan repayment', 'amortization plan', 'grace period interest'],
    'thesis-check': ['thesis check', 'thesis self audit', 'heading numbers', 'figure citations'],
    'docx-format': ['format docx', 'one click format', 'normalize thesis', 'word styles'],
    'group-free-time': ['group free time', 'common free periods', 'meeting schedule', 'class schedule overlap'],
    focus: ['pomodoro', 'white noise', 'study timer', 'focus clock', 'ambient sound'],
    'postgrad-score': ['postgraduate exam', 'weighted score', 'interview score needed', 'preliminary ratio'],
    'dorm-power': ['dorm electricity', 'split utility bill', 'electricity bill calculator'],
    countdown: ['exam countdown', 'days left', 'cet countdown', 'finals countdown card'],
    'md-to-wechat': ['markdown to wechat', 'wechat article format', 'rich text inline styles'],
    wrongbook: ['mistakes notebook', 'active recall', 'flashcards', 'study error log'],
    'campus-budget': ['campus budget', 'living cost', 'monthly allowance', 'student expense tracker'],
    'internship-hours': ['internship hours', 'wage calculator', 'shift log', 'overtime pay'],
    'priority-matrix': ['eisenhower matrix', 'priority tasks', 'urgent important', 'task matrix'],
    'defense-pacer': ['defense speech', 'speech timer', 'pacer', 'rehearse defense'],
    verify: ['claude check', 'diagnostic portal', 'verify environment', 'local diagnostic'],
  },
  ai: {
    title: 'NOVIP Assistant',
    desc: 'Connecting top free AI models (Google Gemini Flash) with all {count} client-side privacy tools to provide student academic Q&A, draft generation, and direct tool navigation.',
    statusBadge: '🛡️ Client-Side Academic Engine (Zero-Config)',
    configBtn: 'Configure API',
    clearBtn: 'Clear',
    wechatHint: '💡 In WeChat browser: Tap recommendation cards to open tools directly; tap copy on drafts to use immediately.',
    welcomeMsg: 'Hello! I am **NOVIP AI Assistant**, your privacy-first academic guide for college study and document challenges.',
    queryPlaceholder: 'Ask NOVIP AI about academic questions or tools (e.g. compress ID photo, calculate target GPA, draft leave request)...',
    sendBtn: 'Send',
    thinking: 'Thinking and analyzing optimal solution...',
    copyDraft: 'Copy Draft',
    copiedDraft: '✓ Draft Copied',
  },
};
`;

writeFileSync(join(root, 'src/i18n/locales/en-US.ts'), enContent);

console.log('Successfully generated zh-CN.ts and en-US.ts!');
