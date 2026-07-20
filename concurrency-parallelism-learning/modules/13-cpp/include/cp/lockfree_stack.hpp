#pragma once
#include <atomic>
#include <memory>
#include <optional>

namespace cp {

/* Lock-free Treiber stack of `T*`. */
template <typename T>
class LockFreeStack {
public:
    void push(T* p) noexcept {
        Node* n = new Node{p, nullptr};
        Node* head = head_.load(std::memory_order_relaxed);
        do {
            n->next = head;
        } while (!head_.compare_exchange_weak(
            head, n,
            std::memory_order_release,
            std::memory_order_relaxed));
    }

    T* pop() noexcept {
        Node* head = head_.load(std::memory_order_relaxed);
        Node* next;
        do {
            if (!head) return nullptr;
            next = head->next;
        } while (!head_.compare_exchange_weak(
            head, next,
            std::memory_order_acquire,
            std::memory_order_relaxed));
        T* v = head->value;
        delete head;  // safe in single-consumer; hazard pointers needed for MPSC
        return v;
    }

    ~LockFreeStack() {
        T* v;
        while ((v = pop()) != nullptr) delete v;
    }

private:
    struct Node {
        T*    value;
        Node* next;
    };
    std::atomic<Node*> head_ = nullptr;
};

}  // namespace cp
