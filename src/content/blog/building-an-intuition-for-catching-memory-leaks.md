---
title: Building an Intuition for Catching Memory Leaks in JavaScript
description: Garbage collection does not prevent memory leaks fully. In this article, I explore how JavaScript deals with memory management and build an intuition around what creates memory leaks.
publishDate: 2026-03-26
slug: building-an-intuition-for-catching-memory-leaks
tags: [JavaScript]
---

As software engineers, it is our job to monitor how our code uses memory and whether it properly releases the resources it consumes, _even when using garbage-collected languages like JavaScript_. Software built without proper handling of the resources it consumes leaks memory, runs slow, becomes unreliable and eventually frustrates the users. We need to deeply comprehend how our code interacts with memory to create performant and reliable software.

**JavaScript frees us from managing memory manually - but not from managing memory correctly.** And to manage memory correctly, we need to understand what happens behind the scenes. Let's take a look at how JavaScript deals with unused memory and how we can write code to not interfere with the process of _garbage collection_. Because when we interfere with that and prevent garbage from being collected, that is when memory leaks occur.

## Memory Leaks

Programs almost always interact with memory in 3 steps:

1. allocate memory
1. use the allocated memory
1. release the allocated memory after it becomes no longer needed

Memory leaks occur at the third step, when programs fail to release the memory space they allocated after that memory becomes no longer needed for that program. A typical side effect of a memory leak is, when a program has it, it consumes more and more RAM over time. Ever ran a program that is fast at the start but becomes slower as you keep using it? The problem is most likely a memory leak.

High-level, garbage-collected languages like JavaScript automate allocating and releasing memory, leaving only "using" part to us programmers. Not having to constantly think about allocating and releasing memory allows us software engineers to focus on other and probably more important parts such as business logic. However, garbage collection does not make our code immune to memory leaks. We can still unintendedly write code that hangs on to the allocated memory after it becomes unneeded and prevent the garbage collector(GC) from "collecting" it. To understand how we may cause that, let's look at how the GC works under the hood.

---

## Garbage Collection

Many high-level languages like JavaScript have a system in place to automatically release the previously allocated memory that became no longer needed. That process is called "garbage collection". Garbage collectors monitor allocated memory, decide when that memory block becomes no longer needed and frees that block when it becomes no longer needed. Actually, the problem of finding what memory is still required is an undecidable problem; so the garbage collectors instead reduce the problem to checking for what memory is still reachable and assume unreachable memory is no longer needed. Figuring out what memory is needed is an undecidable problem because there are other undecidable problems in computer science. Assume the following:

```

    allocate_memory_for_x()

    if (result_of_an_undecidable_problem) {
        use_x();
    }


```

Here, we don't know if `x` will ever be used and thus whether we should release the memory allocated for it or not.

Another example:

```js

    function myFunc() {
        const myObj = { a: 5 };
        myOtherFunc(); // this may contain an infinite loop!
        return myObj.a;
    }


```

This is pretty much the same thing as the previous example, just written in a slightly different shape. Here, it is impossible to decide whether `myObj` will be used after its initialization. Its usage depends on whether `myOtherFunc` will run infinitely or not, which is undecidable as we know from the Halting Problem. Because of that, garbage collectors make an approximation: if an object is not reachable by any other object, it is garbage that needs to be collected. This is an underestimation - there may be objects that are referenced by other objects but still not used - but it is better to underestimate and not collect some unused memory than to overestimate and collect the memory that is still needed and break the program.

JavaScript engines come with their own GC implementation, but essentially they all use the same algorithm: mark-and-sweep. Mark-and-sweep is a garbage collection algorithm that follows the aforementioned approximation consisting of the following steps:

1. create a list of "roots", i.e. variables that are pointed to directly by the browser or the JavaScript engine. For example, objects pointed by local variables, global objects and browser objects such as DOM are roots.
1. all roots are marked as live memory and recursively every child object reachable from those root objects are marked as live objects
1. any "unmarked" object is now considered garbage and collected by the GC

Following this algorithm, the GC finds all "reachable" objects and collects the "non-reachable" ones. Understanding this process will help us understand why certain types of code creates memory leaks while other types do not.

---

## Building an Intuition to Catch Memory Leaks

Now that we know how the GC operates, we can see how keeping references to unused objects can create memory leaks. GC is looking for reachable objects, i.e. objects that are referenced by other objects, keeping objects reachable after we are done using them is the primary cause of memory leaks. I find it similar to _keeping someone hostage_. I know it sounds weird, but hear me out: the GC wants to _free_ memory, but we are keeping it from that by keeping a reference to it. We are essentially keeping unused memory that wants to be freed hostage, and that is what a memory leak is. To prevent memory leaks, we need to stop _chaining_ unused memory with references to it, we need to let go.

Do we know anything in JavaScript that holds on to references even after the execution context containing those references finishes executing? Maybe something that _closes over_ outside references? Would something like that keep unused memory hostage?

Take a look at this React component:

```js

    function MyComp() {
        const bigData = new Array(10_000_000);

        useEffect(() => {
            fetch(someApi).then(() => console.log(bigData.length));
        }, []);

        return <div>Hello</div>;
    }


```

Do you see how a _closure_ is keeping memory hostage? Callback in `then` references `bigData` and prevent it from being released from memory until the promise resolves. This component may unmount before `fetch` is resolved and even in that state where seemingly there is no reference to `bigData`, it will be kept hostage in memory until `fetch` resolves. `fetch` eventually will be resolved, but until that time `bigData` will remain in memory and keep occupying space in the heap. This is a memory leak, maybe not a permanent one, but still one. So, how do we fix that?

Well, we know the issue stems from the callback keeping a reference to `bigData` - so, let's deal with that reference when it is no longer required. It is a fetch operation in this case, we can use an `AbortController` to cancel that async work. The specifics of the closure doesn't really matter that much - it could have been a timeout or some other function that uses closures. The important thing here is to notice that we may keep a large piece of data in memory unnecessarily and that we should free those resources when they become no longer needed.

```js

    function MyComp() {
        const bigData = new Array(10_000_000);

        useEffect(() => {
            const controller = new AbortController();
            fetch(someApi, { signal: controller.signal }).then(() =>
                console.log(bigData.length)
            );

            return () => {
                // cancel async task, removes reference to bigData if the fetch was still ongoing when
                // the component unmounts
                controller.abort();
            };
        }, []);

        return <div>Hello</div>;
    }


```

Now, we cancel the macrotask and ensure that the reference to `bigData` is destroyed when the component unmounts. But again, it doesn't matter if this is a `fetch` or a `setTimeout` etc. These APIs usually provide a way to cancel those macrotasks while they are still in the macrotask queue, such as `AbortController` or `clearTimeout`.

---

## Going Deeper

There are many surface level articles online talking about memory leaks in JavaScript and giving examples similar to the one above: event listeners that are not removed, subscriptions that are not cleaned etc. But all these examples come from the same place. Now that we understand how JavaScript handles garbage collection and how keeping references to unnecessary objects creates memory leaks, we can easily understand all those examples intuitively. Take a look at this code:

```js

    function useWebSocket() {
        useEffect(() => {
            const webSocket = new WebSocket("wss://somewebsocket.com");

            webSocket.onmessage = ({ data }) => {
                console.log(`data from socket: ${data}`);
            };
        }, []);
    }


```

We can now immediately see where we introduce a memory leak to our application if we use this simple hook as it is. The same logic applies: there is a resource that we are keeping hostage when it is no longer needed and wants to be freed. Here, it is a WebSocket connection that is not closed. Imagine if this was a hook that is used in many components over many routes. Eventually, all those WebSocket connections would slow our program down and create a bad user experience. We need to close those connections when they are no longer required:

```js

    function useWebSocket() {
        useEffect(() => {
            const webSocket = new WebSocket("wss://somewebsocket.com");

            webSocket.onmessage = ({ data }) => {
                console.log(`data from socket: ${data}`);
            };

            return () => {
                // close the connection when the component using this hook unmounts
                webSocket.close();
            };
        }, []);
    }


```

As you can see, the logic behind is the same. Whether it is some sort of a data or a connection or even an event listener, holding on to resources when they are no longer needed is the root cause of memory leaks, because that's how the garbage collection works, and because that's how JavaScript manages memory.

ES6 even introduced 2 special data structures to prevent this type of hanging on to unused object references: `WeakMap` and `WeakSet`. But before talking about what they are, let's put our new intuition to use to see what problems may arise if we use their _non-weak_ counterparts(`Map` and `Set`) for some use cases.

Imagine you're building a game where a player can break some blocks by clicking on them. They may have a pickaxe selected to break the block like Minecraft, or something else - doesn't really matter. And for each of the blocks you may want to store the number of times that the player has clicked on them for a variety of reasons; maybe you want to track how damaged the blocks are, or maybe you are just doing it for analytics to see if a level you created is guiding players correctly. So basically, you need a mapping between those block objects and how many times they are clicked. You might not want to put that information directly inside block objects because of performance reasons or maybe simply those block objects belong to a different module in your project and you don't want to modify them. So, let's create that mapping the most straightforward way:

```js

    const blockClickMap = new Map();
    blockClickMap.set(blocks[0], 2);
    blockClickMap.set(blocks[1], 5);
    blockClickMap.set(blocks[2], 8);
    blockClickMap.set(blocks[3], 1);
    blockClickMap.set(blocks[4], 9);
    // etc.


```

Obviously you wouldn't do this by hand, but this is just an example to illustrate my point. Also remember, blocks can be destroyed. If a block is destroyed, we delete all the references to it and we expect it to be garbage collected eventually. But are we _really_ deleting all of the references to it? Notice how we are still hanging on to those block objects because we created a reference to them from the map we created. Even if, say, `blocks[2]` becomes `null` at some point, the object it points to will remain in memory because now it has a reference in the map. It is still reachable and mark-and-sweep algorithm will reach it and mark it to not be garbage collected. But then how do we create a mapping between objects(or anything "garbage collectible" for that matter) and the things that we want to relate to those objects? Enter `WeakMap`:

```js

    const blockClickMap = new WeakMap();


```

By just changing the data structure from `Map` to `WeakMap`, we ensure that we do not hang on to objects that we use as keys. This is the primary use case of these "weak" versions of `Map` and `Set`: storing information about objects without strongly referencing them, and not going in the way of garbage collection for those objects.

This is as true as `WeakSet` as it is for `WeakMap`; after all, an object being in a set also gives us information about that object. `Set`s can be thought as a special form of `Map`s that have the value `true` for each of its keys. Imagine a scenario where you may need to flag some objects to see whether some condition applies to them. You can put those objects in a `Map` as keys with `true` or `false` being as their values, OR you can just put the objects in a `Set` and their mere existence inside of that set will give us information about whether they satisfy that condition or not. And similar to a `WeakMap`, a `WeakSet` will not hold strong references to its items and won't prevent garbage collection if its keys lose their references elsewhere in the code.

With the intuition we built up, it is easy to understand why `WeakMap`s and `WeakSet`s exist: their non-weak counterparts may hold objects put into them as hostages and prevent garbage collection when they become unneeded; `WeakMap` and `WeakSet` display a different type of behavior by keeping a _weak reference_ to objects inside of them. They can still hold objects, but they do not chain them; they are softer and kinder.

This may not be the desired outcome all the time however, and this type of behavior comes with its own quirks. Well firstly, in most cases, you want to keep objects in memory if you associate them with some data. Secondly, since these weak references are all about not getting in the way of garbage collection, you can only use "garbage collectible" types(i.e. objects and non-registered `Symbol`s) as keys in `WeakMap` and as items in `WeakSet`. So, no "strings as keys" for a `WeakMap`. And one of the most important difference between `WeakMap` & `WeakSet` and their non-weak counterparts is; you can't take a whole look at what's inside of a `WeakMap` or a `WeakSet`. You can get information about individual keys or items, but you can't iterate over them or get the size of a `WeakSet` like you do in `Set` with `.size` property. This is because the items stored in these weak-reference data structures are not guaranteed to exist at any given point in time. We know that garbage collection is undecidable; so, the existence of items in a `WeakMap` or `WeakSet` is also undecidable. That means we can't iterate over `WeakMap` or `WeakSet` to see the items they contain, we can only check whether an object we have exists in them. Iteration is not a problem in _non-weak_ `Map` and `Set` because they hold a strong reference to their items, so even if their items lose all references to them, they will still be held by the map or the set. Because of that, `Map` and `Set` can guarantee the existence of their items in memory by creating a strong reference to their items.

When I first learned about `WeakMap`s and `WeakSet`s, I had a question - which I thought was a smart one, but wasn't: How can `WeakMap`s and `WeakSet`s check existence of a single item if they don't allow iteration because of undecidability in garbage collection? How would a `WeakMap` guarantee existence of an object it uses as key and check whether it still contains it if that object can be garbage collected at any time? Well, it wasn't a smart question because to use `has` method of a `WeakMap` or a `WeakSet`, we need a reference to an object to begin with. Seeing it in code might make things a bit clear:

```js

    const obj1 = { a: 1, b: 2 };

    const myWeakMap = new WeakMap();
    myWeakMap.set(obj1, "hi");

    // here I was wondering how can a WeakMap do that because obj1 may be garbage collected at any time
    const containsObj1 = myWeakMap.has(obj1);
    // but what I overlooked was that to call has method of a WeakMap, I need a reference to begin with
    // to be able to call myWeakMap.has(obj1), I need to have obj1 reference


```

Weak references are not just specific to JavaScript. Java has a `WeakHashMap` class very similar to a `WeakMap` for example. Go can create weak references by using `weak` package. This concept of weak references that do not prevent garbage collection is common across many garbage-collected languages and for a good reason: they want to be able to associate objects in memory with some data without holding those objects _hostage_. Again, it all came back to the core intuition we've been building up.

---

## Conclusion

It is easy to overlook memory management when using garbage collected languages like JavaScript. We have to keep in mind that the GC does not necessarily prevent all memory leaks. We can still create conditions that would prevent garbage from being collected, mainly by keeping references to objects that are no longer needed. Getting familiar with this concept and building an intuition around it can help us identify memory leaks in our code before we detect them in devtools. As engineers, it is our job to write quality code that uses resources like memory efficiently and learning more about memory management will make us better engineers.
