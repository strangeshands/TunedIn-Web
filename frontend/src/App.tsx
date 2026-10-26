import { useStudyController } from "./study/hooks/useStudyController";
import { AudioCheckScreen } from "./study/screens/AudioCheckScreen";
import { BaselineIntroScreen } from "./study/screens/BaselineIntroScreen";
import { BlockIntroScreen } from "./study/screens/BlockIntroScreen";
import { BlockResultsScreen } from "./study/screens/BlockResultsScreen";
import { CalibrationResultsScreen } from "./study/screens/CalibrationResultsScreen";
import { CompleteScreen } from "./study/screens/CompleteScreen";
import { HandoverScreen } from "./study/screens/HandoverScreen";
import { IntroductionScreen } from "./study/screens/IntroductionScreen";
import { ParticipantScreen } from "./study/screens/ParticipantScreen";
import { PfsScreen } from "./study/screens/PfsScreen";
import { PracticeScreen } from "./study/screens/PracticeScreen";
import { RecoveryScreen } from "./study/screens/RecoveryScreen";
import { SavingScreen } from "./study/screens/SavingScreen";
import { TaskScreen } from "./study/screens/TaskScreen";

export default function App() {
    const study = useStudyController();
    switch (study.stage) {
        case "participant":
            return <ParticipantScreen {...study} />;
        case "recovery":
            return <RecoveryScreen {...study} />;
        case "introduction":
            return <IntroductionScreen {...study} />;
        case "audio-check":
            return <AudioCheckScreen {...study} />;
        case "saving":
            return <SavingScreen {...study} />;
        case "practice":
            if (study.started !== null) return <TaskScreen {...study} />;
            return <PracticeScreen {...study} />;
        case "baseline-intro":
            return <BaselineIntroScreen {...study} />;
        case "calibration-results":
            return <CalibrationResultsScreen {...study} />;
        case "block-intro":
            return <BlockIntroScreen {...study} />;
        case "pfs":
            return <PfsScreen {...study} />;
        case "block-results":
            return <BlockResultsScreen {...study} />;
        case "complete":
            return <CompleteScreen {...study} />;
        case "handover":
            return <HandoverScreen {...study} />;
        default:
            return <TaskScreen {...study} />;
    }
}
