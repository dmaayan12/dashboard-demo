import { Box, VStack, HStack, Text, Heading, Dialog, Circle, Image, Accordion } from '@chakra-ui/react';
import { Check, Banknote } from 'lucide-react';
import actualExample from '../assets/help/actual-example.png';
import debtExample from '../assets/help/debt-example.png';
import extensionExample from '../assets/help/extension-example.png';
import milestonePercentExample from '../assets/help/milestone-percent-example.png';
import targetExample from '../assets/help/target-example.png';
import completedExample from '../assets/help/completed-example.png';
import cancelledExample from '../assets/help/cancelled-example.png';
import milestoneGreenExample from '../assets/help/milestone-green-example.png';
import milestoneRedExample from '../assets/help/milestone-red-example.png';
import milestoneYellowExample from '../assets/help/milestone-yellow-example.png';

const LegendExplainRow = ({ icon, title, description, screenshot }) => (
  <HStack align="start" gap={3}>
    <Box flexShrink={0} mt="2px">{icon}</Box>
    <VStack align="start" gap={0} flex={1}>
      <Text fontWeight="bold" fontSize="sm">{title}</Text>
      <Text fontSize="sm" color="fg.muted">{description}</Text>
    </VStack>
    {screenshot && (
      <Image src={screenshot} alt={title} boxSize="60px" objectFit="contain" flexShrink={0} borderRadius="md" />
    )}
  </HStack>
);

// Each topic is its own collapsible section (multiple can be open at once) instead of one long
// scrolling page - the dialog had grown to cover several unrelated topics (legend, target-debt
// mechanics, payment-policy/milestones) and reading it top-to-bottom felt like a document, not a
// quick lookup (per the user's explicit feedback, 2026-07-13).
const AccordionSection = ({ value, title, children }) => (
  <Accordion.Item value={value} border="1px solid" borderColor="border.subtle" borderRadius="lg" px={4}>
    <Accordion.ItemTrigger py={3} cursor="pointer">
      <HStack flex={1}>
        <Heading size="sm">{title}</Heading>
      </HStack>
      <Accordion.ItemIndicator />
    </Accordion.ItemTrigger>
    <Accordion.ItemContent>
      <Accordion.ItemBody pb={4}>
        {children}
      </Accordion.ItemBody>
    </Accordion.ItemContent>
  </Accordion.Item>
);

const HelpDialog = ({ open, onClose }) => (
  <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} dir="rtl">
    <Dialog.Backdrop />
    <Dialog.Positioner>
      <Dialog.Content maxW="640px" textAlign="right">
        <Dialog.Header>
          <Dialog.Title>איך לקרוא את הדשבורד</Dialog.Title>
        </Dialog.Header>
        <Dialog.Body>
          <Accordion.Root multiple defaultValue={[]} dir="rtl">
            <VStack align="stretch" gap={3}>
              <AccordionSection value="legend" title="מה כל עיגול/צורה אומרים">
                <VStack align="stretch" gap={3}>
                  <LegendExplainRow
                    icon={<Circle size="14px" bg="blue.400" opacity={0.3} />}
                    title="יעד"
                    description="כמה כסף היה אמור להיכנס באותו חודש, לפי התכנון."
                    screenshot={targetExample}
                  />
                  <LegendExplainRow
                    icon={<Circle size="14px" bg="green.500" />}
                    title="בפועל"
                    description="כמה עבודה/כסף באמת נרשם באותו חודש."
                    screenshot={actualExample}
                  />
                  <LegendExplainRow
                    icon={<Circle size="14px" border="1.5px dashed" borderColor="orange.500" bg="transparent" />}
                    title="חוב"
                    description="החודש הזה 'ספג' תוספת כי בחודשים קודמים לא הספיקו לעבוד מספיק ביחס למתוכנן - היעד שלו גדל כדי לפצות."
                    screenshot={debtExample}
                  />
                  <LegendExplainRow
                    icon={
                      <Circle size="14px" border="1.5px solid" borderColor="green.500" bg="transparent" display="flex" alignItems="center" justifyContent="center">
                        <Check size={9} strokeWidth={3} color="var(--chakra-colors-green-500)" />
                      </Circle>
                    }
                    title="הושלם"
                    description="החודש הזה כבר 'סגור' לגמרי - לא נשאר בו יעד לכיסוי, כי זיכוי מחודשים אחרים כיסה אותו."
                    screenshot={completedExample}
                  />
                  <LegendExplainRow
                    icon={<Circle size="14px" border="1.5px solid" borderColor="green.400" bg="transparent" opacity={0.6} />}
                    title="זיכוי חלקי"
                    description="היעד של החודש הזה קטן בגלל זיכוי מחודשים אחרים - אבל לא התאפס לגמרי (שונה מ'הושלם' למעלה, שם היעד ירד כמעט לאפס)."
                  />
                  <LegendExplainRow
                    icon={<Circle size="14px" border="1.5px dashed" borderColor="gray.400" bg="transparent" />}
                    title="הרחבה"
                    description="חודש שנוסף מעבר ללוז המקורי (הפרויקט התארך)."
                    screenshot={extensionExample}
                  />
                  <LegendExplainRow
                    icon={<Box w="14px" h="14px" bg="gray.200" borderRadius="sm" opacity={0.6} />}
                    title="בוטל"
                    description="חודש שהיה בתכנון המקורי אבל הוסר מהלוז העדכני, ולא בוצעה בו עבודה."
                    screenshot={cancelledExample}
                  />
                </VStack>
              </AccordionSection>

              <AccordionSection value="target-mechanics" title='איך "היעד" של כל חודש נקבע'>
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  הדשבורד לוקח את השווי הכולל של הפרויקט ומחלק אותו שווה-בשווה על פני ימי העבודה בציר הזמן שלו.
                  אבל אם עבדו יותר או פחות מהמתוכנן, הוא לא סתם משאיר "פער" - הוא מגלגל אותו קדימה או אחורה, כדי שהיעד הכולל של שארית הפרויקט תמיד ישקף את המצב האמיתי.
                </Text>
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  <b>דוגמה:</b> פרויקט בשווי 100,000 ₪, מתוכנן על פני 5 חודשים (20,000 ₪ לחודש). אנחנו כרגע באמצע חודש 2.
                </Text>
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  <b>אם עבדו יותר מהמתוכנן</b> (למשל 50,000 ₪ כבר נרשמו בחודשים 1-2, למרות שהתכנון היה רק 40,000 ₪): נשאר לשלם 50,000 ₪ (100,000 פחות מה שכבר נרשם), אבל התכנון המקורי לחודשים 3-5 היה 60,000 ₪. כלומר יש "עודף" של 10,000 ₪ - התכנון המקורי גבוה מדי ביחס למה שבאמת נשאר. הדשבורד "מזכה" את זה מהסוף אחורה: חודש 5 (האחרון) מקבל זיכוי של 10,000 ₪ מתוך ה-20,000 שלו, כך שהיעד שלו יורד ל-10,000 ₪ בלבד.
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  <b>אם עבדו פחות מהמתוכנן</b> (למשל רק 20,000 ₪ נרשמו בחודשים 1-2): נשאר לשלם 80,000 ₪, אבל התכנון המקורי לחודשים 3-5 היה רק 60,000 ₪ - חסרים 20,000 ₪. הדשבורד מפזר את החוב הזה על חודשים 3-5, יחסית לכמות ימי העבודה בכל אחד - זה מה שמופיע כ"חוב" (העיגול המקווקו הכתום).
                </Text>
              </AccordionSection>

              <AccordionSection value="payment-policy" title="מדיניות תשלום (אבני דרך)">
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  לפרויקט שמשולם באבני דרך (למשל 50% בהתחלה + 50% בסיום) אפשר להגדיר את זה דרך כפתור ההגדרות ליד שם הפרויקט.
                </Text>
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  בפרויקט כזה הכסף לא נכנס בהתאם לעבודה החודשית (רוב הסכום מתקבל רק באבן דרך אחת), אז הוא לא יכול לשקף אם מתקדמים בקצב. לכן העיגולים של פרויקט כזה עוברים לעקוב אחרי <b>אחוז השלמת המשימות</b> במקום כסף: "יעד" הוא כמה אחוז מהפרויקט היה אמור להיות מושלם עד אותו חודש, ו"בפועל" הוא אחוז המשימות שבאמת עברו לסטטוס "בוצע" עד אותו חודש.
                </Text>
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  <b>חשוב להבין איך "יעד" נקבע כאן</b> - בדיוק כמו בפרויקט כספי רגיל (ראו הסעיף הקודם): "יעד חודשי" נקבע <b>רק</b> לפי תאריך ההתחלה, תאריך הסיום העדכני, וימי העבודה שיש בכל חודש ביניהם - חלוקה שווה, בלי שום קשר לכמות המשימות, לגודלן, או לכמה שעות מוערכות עליהן. "יעד עדכני" הוא זה שכן מתחשב בהתקדמות בפועל - <b>אותו מנגנון חוב/זיכוי בדיוק</b> שהוסבר בסעיף הקודם עם הדוגמה המספרית, רק על בסיס אחוזים במקום שקלים: אם עבדו לאט יותר מהתכנון, "החוב" מתפזר על פני כל החודשים העתידיים; אם עבדו מהר יותר, ה"זיכוי" מנוכה מהחודש האחרון של הפרויקט אחורה (ואם חודש שלם מכוסה לגמרי - זה בדיוק מה שמסומן "הושלם").
                </Text>
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  ליד כל אחוז מוצג גם מספר שעות בסוגריים (למשל "20% (40h)") - זה <b>לא</b> נתון נפרד, אלא רק תרגום של אותו אחוז לכמות שעות (האחוז כפול סך השעות המשוערות של כל הפרויקט), כדי שיהיה קל יותר לדמיין. לחודשים שכבר עברו, גם האחוז וגם מספר-השעות הזה נשארים קבועים לנצח - גם אם מוסיפים משימות/שעות לפרויקט בהמשך.
                </Text>
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  <b>אבן דרך שמוגדרת ל"בסיום הפרויקט"</b> עוקבת אוטומטית אחרי הלו"ז העדכני - ואם הלו"ז מתקצר (ידנית, או כי ביצוע המשימות התקדם מהר יותר מהתכנון ואין יותר עבודה קרוב לתאריך הסיום הרשמי), האייקון "זז" אוטומטית לחודש האחרון שבו יש עבודה אמיתית (שעות שנרשמו, או משימה שעדיין מתוכננת לשם) - כדי שלא יישאר "תקוע" בחודש ריק ולא-רלוונטי.
                </Text>
                <Text fontSize="sm" color="fg.muted" mb={2}>
                  התגית עם האחוז שמופיעה על כל עיגול מציגה משהו שלישי ונפרד: כמה אחוז מהמשימות עברו ל"בוצע" <b>באותו חודש ספציפית</b> (לא מצטבר) - קצב הזרימה החודשי. התג ליד שם הפרויקט מציג את אחוז ההשלמה המצטבר של כל הפרויקט.
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  כסף עדיין מופיע בטולטיפ של החודש שבו נופלת אבן דרך בפועל, וגם שעות העבודה שנרשמו בפועל מוצגות שם כמידע נלווה (עם דגל אדום אם יש חריגה מהתכנון) - אבל שני אלה הם רק הקשר, הם לא מה שמניע את העיגולים.
                </Text>
                <Image src={milestonePercentExample} alt="דוגמה לעיגול באחוזי השלמה" boxSize="90px" objectFit="contain" mt={2} borderRadius="md" />

                <Text fontSize="sm" color="fg.muted" mt={2}>
                  <b>גודל העיגולים (יעד וביצוע)</b> בפרויקט כזה מושווה תמיד מול <b>הערך הכי-גבוה שהיה אי-פעם לפרויקט הזה עצמו</b> (יעד או ביצוע, הגבוה מביניהם) - לא מול פרויקטים אחרים. שני העיגולים משתמשים באותו קנה-מידה, כך שאחוז גבוה יותר תמיד ייראה גדול יותר משל אחוז נמוך יותר, בין אם זה יעד או ביצוע. עיגול שנראה "מלא לגמרי" הוא הערך הכי גבוה שהיה לפרויקט הזה עד כה, לא בהכרח 100% מכלל העבודה - ולכן גם לא ניתן להשוות גודל עיגול בין שני פרויקטים שונים.
                </Text>

                <Heading size="sm" mt={3} mb={2}>סמל אבן הדרך (השק בפינת העיגול)</Heading>
                <VStack align="stretch" gap={3}>
                  <LegendExplainRow
                    icon={
                      <Circle size="18px" bg="green.500">
                        <Banknote size={10} color="white" />
                      </Circle>
                    }
                    title="ירוק - מומשה"
                    description="אבן הדרך כבר מומשה ככסף אמיתי, ואין חוב פתוח בנקודת הזמן הזו."
                    screenshot={milestoneGreenExample}
                  />
                  <LegendExplainRow
                    icon={
                      <Circle size="18px" bg="red.500">
                        <Banknote size={10} color="white" />
                      </Circle>
                    }
                    title="אדום - בסיכון"
                    description="יש חוב פתוח בנקודת הזמן הזו - אבן הדרך בסיכון מימוש אם לא ישלימו את הקצב."
                    screenshot={milestoneRedExample}
                  />
                  <LegendExplainRow
                    icon={
                      <Circle size="18px" bg="yellow.500">
                        <Banknote size={10} color="white" />
                      </Circle>
                    }
                    title="צהוב - ממתין לאישור"
                    description={'התאריך של אבן הדרך הגיע מוקדם מהצפוי (בגלל תנאי-זמן חלופי שהוגדר, או כי המשימות הושלמו מהר יותר מהתכנון) - וממתין לאישור ידני לפני שהוא נחשב כסף אמיתי. יש ללחוץ "אשר" בהגדרות מדיניות התשלום של הפרויקט.'}
                    screenshot={milestoneYellowExample}
                  />
                </VStack>
              </AccordionSection>
            </VStack>
          </Accordion.Root>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Positioner>
  </Dialog.Root>
);

export default HelpDialog;
