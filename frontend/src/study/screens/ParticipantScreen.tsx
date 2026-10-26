import type { OrderId, StudyMode } from "../../../../shared/types";
import { Field, SimpleStage } from "../components";
import type { StudyController } from "../hooks/useStudyController";

type Props = Pick<
    StudyController,
    "participantId"
    | "setParticipantId"
    | "orderId"
    | "setOrderId"
    | "orders"
    | "studyMode"
    | "setStudyMode"
    | "formativeTiming"
    | "message"
    | "conditionOrder"
    | "saveParticipant"
    | "recoverSavedParticipant"
    | "updateFormativeTiming"
>;

export function ParticipantScreen({
    participantId,
    setParticipantId,
    orderId,
    setOrderId,
    orders,
    studyMode,
    setStudyMode,
    formativeTiming,
    message,
    conditionOrder,
    saveParticipant,
    recoverSavedParticipant,
    updateFormativeTiming,
}: Props) {
    return (
        <SimpleStage
            eyebrow="SESSION SETUP"
            title="Participant setup"
            description="Enter the participant ID before beginning."
            participantId=""
        >
            <form onSubmit={saveParticipant}>
                <Field
                    label="Participant ID"
                    value={participantId}
                    autoFocus
                    onChange={setParticipantId}
                />
                <label className="field">
                    <span>Mode</span>
                    <select
                        value={studyMode}
                        onChange={(event) =>
                            setStudyMode(event.target.value as StudyMode)
                        }
                    >
                        <option value="Pilot">Pilot</option>
                        <option value="Main">Main</option>
                        <option value="Formative">Formative Testing</option>
                    </select>
                </label>
                {studyMode === "Formative" ? (
                    <div className="instructions">
                        <b>Formative Testing</b>
                        <p>
                            This session will run one Adaptive Music block.
                        </p>
                        <label className="field">
                            <span>Practice duration (seconds)</span>
                            <input
                                type="number"
                                min="1"
                                value={formativeTiming.practiceSeconds}
                                onChange={(event) =>
                                    updateFormativeTiming(
                                        "practiceSeconds",
                                        event.target.value,
                                    )
                                }
                            />
                        </label>
                        <label className="field">
                            <span>Baseline duration (seconds)</span>
                            <input
                                type="number"
                                min="1"
                                value={formativeTiming.baselineSeconds}
                                onChange={(event) =>
                                    updateFormativeTiming(
                                        "baselineSeconds",
                                        event.target.value,
                                    )
                                }
                            />
                        </label>
                        <label className="field">
                            <span>Adaptive block duration (seconds)</span>
                            <input
                                type="number"
                                min="1"
                                value={formativeTiming.blockSeconds}
                                onChange={(event) =>
                                    updateFormativeTiming(
                                        "blockSeconds",
                                        event.target.value,
                                    )
                                }
                            />
                        </label>
                    </div>
                ) : (
                    <label className="field">
                        <span>Counterbalanced Order</span>
                        <select
                            value={orderId}
                            onChange={(event) =>
                                setOrderId(event.target.value as OrderId)
                            }
                        >
                            {Object.entries(orders).map(([id], index) => (
                                <option key={id} value={id}>
                                    Order {index + 1}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <button
                    className="primary large"
                    disabled={!conditionOrder.length}
                >
                    Save participant & continue
                </button>
                <button
                    className="secondary large"
                    type="button"
                    disabled={!participantId.trim()}
                    onClick={() => void recoverSavedParticipant()}
                >
                    Recover saved session
                </button>
            </form>
            {message && <p className="error">{message}</p>}
        </SimpleStage>
    );
}
