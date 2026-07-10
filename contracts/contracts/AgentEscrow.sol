// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title AgentEscrow
/// @notice Escrow for AI agent-to-agent task payments, released automatically
///         based on a trusted AI verifier's verdict.
contract AgentEscrow is Ownable, ReentrancyGuard, Pausable {
    enum Status { Created, Funded, Accepted, Submitted, Released, Refunded }

    struct EscrowTask {
        address creator;
        address worker;
        uint256 amount;
        string taskDescription;
        string successCriteria;
        string resultURI;
        Status status;
    }

    uint256 public nextEscrowId = 1;
    mapping(uint256 => EscrowTask) public escrows;

    address public verifier;
    uint256 public feeBps = 200;
    uint256 public constant MAX_FEE_BPS = 1000;

    event EscrowCreated(uint256 indexed escrowId, address indexed creator, string taskDescription, string successCriteria);
    event EscrowFunded(uint256 indexed escrowId, uint256 amount);
    event TaskAccepted(uint256 indexed escrowId, address indexed worker);
    event ResultSubmitted(uint256 indexed escrowId, string resultURI);
    event VerdictSubmitted(uint256 indexed escrowId, bool passed, string reason);
    event PaymentReleased(uint256 indexed escrowId, address indexed worker, uint256 amount, uint256 fee);
    event Refunded(uint256 indexed escrowId, address indexed creator, uint256 amount);
    event VerifierUpdated(address indexed newVerifier);
    event FeeUpdated(uint256 newFeeBps);

    constructor(address _verifier) Ownable(msg.sender) {
        require(_verifier != address(0), "Invalid verifier");
        verifier = _verifier;
    }

    modifier onlyVerifier() {
        require(msg.sender == verifier, "Not authorized verifier");
        _;
    }

    function createAndFundEscrow(string calldata taskDescription, string calldata successCriteria)
        external
        payable
        whenNotPaused
        returns (uint256)
    {
        require(msg.value > 0, "Must deposit funds");
        uint256 escrowId = nextEscrowId++;
        escrows[escrowId] = EscrowTask({
            creator: msg.sender,
            worker: address(0),
            amount: msg.value,
            taskDescription: taskDescription,
            successCriteria: successCriteria,
            resultURI: "",
            status: Status.Funded
        });
        emit EscrowCreated(escrowId, msg.sender, taskDescription, successCriteria);
        emit EscrowFunded(escrowId, msg.value);
        return escrowId;
    }

    function acceptTask(uint256 escrowId) external whenNotPaused {
        EscrowTask storage e = escrows[escrowId];
        require(e.status == Status.Funded, "Task not available");
        require(e.creator != msg.sender, "Creator cannot accept own task");
        e.worker = msg.sender;
        e.status = Status.Accepted;
        emit TaskAccepted(escrowId, msg.sender);
    }

    function submitResult(uint256 escrowId, string calldata resultURI) external whenNotPaused {
        EscrowTask storage e = escrows[escrowId];
        require(e.status == Status.Accepted, "Task not in accepted state");
        require(e.worker == msg.sender, "Only assigned worker can submit");
        e.resultURI = resultURI;
        e.status = Status.Submitted;
        emit ResultSubmitted(escrowId, resultURI);
    }

    function submitVerdict(uint256 escrowId, bool passed, string calldata reason)
        external
        onlyVerifier
        nonReentrant
        whenNotPaused
    {
        EscrowTask storage e = escrows[escrowId];
        require(e.status == Status.Submitted, "Task not submitted");

        emit VerdictSubmitted(escrowId, passed, reason);

        if (passed) {
            uint256 fee = (e.amount * feeBps) / 10000;
            uint256 payout = e.amount - fee;
            e.status = Status.Released;
            (bool sentWorker, ) = payable(e.worker).call{value: payout}("");
            require(sentWorker, "Payout transfer failed");
            if (fee > 0) {
                (bool sentFee, ) = payable(owner()).call{value: fee}("");
                require(sentFee, "Fee transfer failed");
            }
            emit PaymentReleased(escrowId, e.worker, payout, fee);
        } else {
            e.status = Status.Refunded;
            (bool sentRefund, ) = payable(e.creator).call{value: e.amount}("");
            require(sentRefund, "Refund transfer failed");
            emit Refunded(escrowId, e.creator, e.amount);
        }
    }

    function setVerifier(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "Invalid address");
        verifier = newVerifier;
        emit VerifierUpdated(newVerifier);
    }

    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getEscrow(uint256 escrowId) external view returns (EscrowTask memory) {
        return escrows[escrowId];
    }
}
